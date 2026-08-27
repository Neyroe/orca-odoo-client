// Value → text for a raw Odoo domain, in the notation Odoo prints: tuples for
// conditions, lists for values, single quotes, `True`/`False`/`None`.
//
// Display only — storage stays the array it always was. The user reads and writes
// one language, and it is the one they copy their domains out of.

/** The two operators whose value is another domain, so its items are conditions too. */
const SUBDOMAIN_OPERATORS = new Set(['any', 'not any'])

/** Single-quoted, so the output pastes back into Odoo and back into this box. */
function formatText(value: string): string {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
  return `'${escaped}'`
}

/** A leaf's value: nested arrays stay lists, the way `in` takes one. */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return formatText(value)
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (value === true) {
    return 'True'
  }
  if (value === false) {
    return 'False'
  }
  if (value === null || value === undefined) {
    return 'None'
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatValue(item)).join(', ')}]`
  }
  // Unreachable for a validated domain; kept so an unexpected leaf shows as
  // itself rather than as "[object Object]".
  return JSON.stringify(value) ?? 'None'
}

function formatCondition(leaf: readonly unknown[]): string {
  const operator = leaf[1]
  const subdomain = typeof operator === 'string' && SUBDOMAIN_OPERATORS.has(operator)
  const items = leaf.map((item, index) =>
    subdomain && index === 2 && Array.isArray(item) ? formatDomain(item) : formatValue(item)
  )
  return `(${items.join(', ')})`
}

/** An element of a domain: a condition tuple, or a prefix operator string. */
function formatElement(element: unknown): string {
  return Array.isArray(element) ? formatCondition(element) : formatValue(element)
}

function formatDomain(domain: readonly unknown[]): string {
  return `[${domain.map((element) => formatElement(element)).join(', ')}]`
}

/** One line, for the toolbar box. */
export function formatOdooDomainLiteral(domain: readonly unknown[]): string {
  return formatDomain(domain)
}

/**
 * One element per line, for a domain long enough that a single line hides its
 * shape. No trailing comma — the parser accepts one, Odoo's repr does not print
 * one.
 */
export function formatOdooDomainLiteralBlock(domain: readonly unknown[]): string {
  if (domain.length === 0) {
    return '[]'
  }
  const lines = domain.map((element) => `  ${formatElement(element)}`).join(',\n')
  return `[\n${lines}\n]`
}
