// Version negotiation for the `$orca:` tokens a ticket domain can carry. Split
// out of runtime-odoo-client.ts to keep that file inside its max-lines budget;
// the client re-exports this contract so callers still import it from there.
import { domainUsesOrcaToken } from '../../../shared/odoo-domain-tokens'
import { ODOO_DOMAIN_TOKENS_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import { runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import type { RuntimeClientTarget } from './runtime-client-target'

// Why: a host predating the `$orca:` namespace forwards the token to Odoo as a
// literal string, so the read fails inside `search_read` with a server error that
// says nothing about the real cause. Resolving the token here instead is not an
// option: a client-side uid is right for at most one instance, and the read fans
// out to all of them.
export class OdooCurrentUserTokenUnsupportedError extends Error {
  constructor(
    message = 'This remote runtime must be updated to filter Odoo tickets by the current user.'
  ) {
    super(message)
    this.name = 'OdooCurrentUserTokenUnsupportedError'
  }
}

export function isOdooCurrentUserTokenUnsupportedError(
  error: unknown
): error is OdooCurrentUserTokenUnsupportedError {
  return error instanceof OdooCurrentUserTokenUnsupportedError
}

/** Refuses a domain carrying a token the paired host cannot resolve. Only reads
 *  that actually use one negotiate: every other domain crosses unchanged. */
export async function assertCurrentUserTokenSupported(
  target: RuntimeClientTarget,
  domain: unknown[]
): Promise<void> {
  if (target.kind !== 'environment' || !domainUsesOrcaToken(domain)) {
    return
  }
  const supported = await runtimeEnvironmentSupportsCapability(
    target.environmentId,
    ODOO_DOMAIN_TOKENS_RUNTIME_CAPABILITY,
    30_000
  )
  if (!supported) {
    throw new OdooCurrentUserTokenUnsupportedError()
  }
}
