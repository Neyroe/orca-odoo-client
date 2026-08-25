// Syntax check for a raw Odoo domain, plus the AND-grouping that makes one safe
// to splice next to other domains.
//
// Shared so the renderer can tell the user what is wrong as they type, while the
// main process runs the same check because it trusts no caller — an old client or
// a direct RPC call never crossed the renderer at all.
//
// Odoo domains are prefix expressions: '&' and '|' take two operands, '!' takes
// one, and a leaf is an operand. An unbalanced domain is not merely refused by
// the server — spliced between Orca's own fragments it *parses*, and its dangling
// operator swallows the neighbouring leaf: the project scope, or a BASE_DOMAIN
// leaf, in which case template tasks surface in the list. Checking the balance
// here is what keeps a user domain from quietly undoing either.
import { isOrcaTokenNamespace, MAX_DOMAIN_VALUE_DEPTH, ORCA_TOKENS } from './odoo-domain-tokens'

const PREFIX_OPERATOR_ARITY = new Map<unknown, number>([
  ['&', 2],
  ['|', 2],
  ['!', 1]
])

const AND_OPERATOR = '&'

// Odoo's `TERM_OPERATORS`, verbatim.
const LEAF_OPERATORS = new Set([
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  '=?',
  '=like',
  '=ilike',
  'like',
  'not like',
  'ilike',
  'not ilike',
  'in',
  'not in',
  'child_of',
  'parent_of',
  'any',
  'not any'
])

export type OdooDomainCheck =
  | { ok: true; domain: unknown[]; operandCount: number }
  | { ok: false; error: string }

/**
 * Why a value is otherwise unchecked: a domain may filter on a field Orca never
 * reads, with any literal. Only the reserved `$orca:` namespace is policed, so an
 * unknown token is refused rather than sent to Odoo as a literal string.
 */
function valueError(value: unknown, at: number): string | null {
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 0 }]
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) {
      break
    }
    if (isOrcaTokenNamespace(entry.node) && !ORCA_TOKENS.has(entry.node)) {
      return `The condition at position ${at} uses an unknown Orca token "${entry.node}".`
    }
    if (Array.isArray(entry.node)) {
      if (entry.depth >= MAX_DOMAIN_VALUE_DEPTH) {
        return `The condition at position ${at} nests its value too deeply.`
      }
      for (const item of entry.node) {
        stack.push({ node: item, depth: entry.depth + 1 })
      }
    }
  }
  return null
}

function leafError(leaf: readonly unknown[], at: number): string | null {
  if (leaf.length !== 3) {
    return `The condition at position ${at} must read [field, operator, value].`
  }
  const [field, operator, value] = leaf
  if (typeof field !== 'string' || !field.trim()) {
    return `The condition at position ${at} must start with a field name.`
  }
  // A token stands for a value; read as a field it would filter on something else.
  if (isOrcaTokenNamespace(field)) {
    return `The condition at position ${at} uses the reserved "$orca:" prefix as a field name.`
  }
  if (typeof operator !== 'string' || !LEAF_OPERATORS.has(operator)) {
    const named = typeof operator === 'string' ? ` "${operator}"` : ''
    return `The condition at position ${at} uses an unknown operator${named}.`
  }
  return valueError(value, at)
}

/**
 * Parses `value` as an Odoo domain. Never throws and never repairs: a caller that
 * gets `ok: false` has a domain Odoo would read differently than its author meant.
 *
 * `operandCount` is how many top-level operands the domain reduces to — Odoo ANDs
 * those implicitly, and `andGroupedDomain` makes that grouping explicit.
 */
export function parseOdooDomain(value: unknown): OdooDomainCheck {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'A domain must be a list of conditions.' }
  }
  // An empty domain matches everything; it is valid and holds no operand.
  if (value.length === 0) {
    return { ok: true, domain: value, operandCount: 0 }
  }
  // Iterative rather than recursive so a pathological nesting depth cannot blow
  // the stack on input that came from a text field.
  const pending: { token: string; at: number; remaining: number }[] = []
  let operandCount = 0
  for (let index = 0; index < value.length; index += 1) {
    const token = value[index]
    const arity = PREFIX_OPERATOR_ARITY.get(token)
    if (arity !== undefined) {
      pending.push({ token: token as string, at: index, remaining: arity })
      continue
    }
    if (!Array.isArray(token)) {
      return {
        ok: false,
        error: `Position ${index} is neither a condition nor one of "&", "|", "!".`
      }
    }
    const invalid = leafError(token, index)
    if (invalid) {
      return { ok: false, error: invalid }
    }
    // Feed the completed operand up: each operator it satisfies becomes an
    // operand in turn.
    let satisfied = true
    while (satisfied) {
      const open = pending.at(-1)
      if (!open) {
        operandCount += 1
        break
      }
      open.remaining -= 1
      satisfied = open.remaining === 0
      if (satisfied) {
        pending.pop()
      }
    }
  }
  const unsatisfied = pending.at(-1)
  if (unsatisfied) {
    return {
      ok: false,
      error: `The "${unsatisfied.token}" operator at position ${unsatisfied.at} is missing an operand.`
    }
  }
  return { ok: true, domain: value, operandCount }
}

/**
 * The same domain reduced to a single operand, by making Odoo's implicit AND
 * between its top-level operands explicit.
 *
 * Throws on an invalid domain rather than returning it ungrouped — handing back
 * an unbalanced domain is exactly the leak this exists to close.
 */
export function andGroupedDomain(domain: unknown[]): unknown[] {
  const parsed = parseOdooDomain(domain)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  if (parsed.operandCount < 2) {
    return [...domain]
  }
  return [...Array.from({ length: parsed.operandCount - 1 }, () => AND_OPERATOR), ...domain]
}
