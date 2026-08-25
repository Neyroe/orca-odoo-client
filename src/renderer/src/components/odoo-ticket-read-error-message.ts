// What the ticket panel's banner says when a read fails.
import { isOdooCurrentUserTokenUnsupportedError } from '@/runtime/runtime-odoo-client'
import { translate } from '@/i18n/i18n'

/**
 * Named cause for the token refusal, because the panel's default read now
 * compiles `$orca:me` and a host predating `odoo.domain-tokens.v1` refuses it
 * before the round trip: the raw error names a "remote runtime", which reads as a
 * broken connection, and sends the user off to rewrite a domain that was never
 * the cause.
 *
 * Why this is a message and not a fallback to the preset `listTickets` RPC the
 * host still serves: the compiled domain carries the facets too, so a preset read
 * would answer a different question and show its rows as if they were the
 * answer — silently, which is the failure the token negotiation exists to raise.
 */
export function odooTicketReadErrorMessage(error: unknown): string {
  if (isOdooCurrentUserTokenUnsupportedError(error)) {
    return translate(
      'auto.components.odoo.ticket.read.error.message.currentUserToken',
      'The remote Orca host is too old to filter on the signed-in Odoo user. Update the host, or pick a named assignee — the connection and the domain are fine.'
    )
  }
  return error instanceof Error ? error.message : String(error)
}
