// The placeholder a stored Odoo domain carries for "the signed-in user", written
// by the renderer and resolved by the main process at read time.
//
// Why not a plain uid: `OdooInstance.uid` is resolved per instance at connect
// time, so a saved filter holding `['user_ids', 'in', [180]]` reads as a
// stranger's tickets on the second instance — wrongly, and with no error to show
// for it. A token has no meaning until a client resolves it, so it cannot be
// wrong on the instance it was not written for.
//
// Shared, not duplicated: a renderer-side copy of the token string would drift
// one day, and the drift is silent — an unrecognized token is not an error, it is
// a filter on a string that matches nothing.

/** Reserved value namespace: any other `$orca:` string is refused, so a typo fails loudly. */
export const ORCA_TOKEN_PREFIX = '$orca:'

export const CURRENT_USER_TOKEN = `${ORCA_TOKEN_PREFIX}me`

export const ORCA_TOKENS = new Set<string>([CURRENT_USER_TOKEN])

export function isOrcaTokenNamespace(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ORCA_TOKEN_PREFIX)
}

/**
 * How deep a leaf value may nest. Deep enough for the subdomain an `any` leaf
 * takes, shallow enough that every walk over a domain — validation, resolution,
 * the capability scan — terminates on input nobody wrote by hand.
 */
export const MAX_DOMAIN_VALUE_DEPTH = 32

/**
 * Whether `domain` carries anything from the reserved namespace.
 *
 * The whole namespace, not just the tokens this build knows: a host that cannot
 * resolve `$orca:` at all forwards it to Odoo as a literal string, and that is
 * true of a token this client has never heard of too.
 */
export function domainUsesOrcaToken(domain: unknown[]): boolean {
  const stack: { node: unknown; depth: number }[] = domain.map((node) => ({ node, depth: 0 }))
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) {
      break
    }
    if (isOrcaTokenNamespace(entry.node)) {
      return true
    }
    if (Array.isArray(entry.node) && entry.depth < MAX_DOMAIN_VALUE_DEPTH) {
      for (const item of entry.node) {
        stack.push({ node: item, depth: entry.depth + 1 })
      }
    }
  }
  return false
}

function resolvedValue(value: unknown, uid: number): unknown {
  if (value === CURRENT_USER_TOKEN) {
    return uid
  }
  // Reached for an `in` list and for the subdomain an `any` leaf takes.
  return Array.isArray(value) ? value.map((item) => resolvedValue(item, uid)) : value
}

/**
 * The same domain with every current-user token replaced by `uid`.
 *
 * Only a leaf's value is rewritten: a field name is never a token, and rewriting
 * one would turn a filter into a read of a different field. Operators pass
 * through untouched.
 *
 * Validated input only — `parseOdooDomain` bounds how deep a value may nest, and
 * this walk recurses to that same depth.
 */
export function resolveCurrentUserToken(domain: unknown[], uid: number): unknown[] {
  return domain.map((token) =>
    Array.isArray(token) && token.length === 3
      ? [token[0], token[1], resolvedValue(token[2], uid)]
      : token
  )
}
