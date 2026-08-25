// Compiles a ticket-filter preset into the Odoo domain it stands for.
//
// Shared because the presets are seeded as saved filters: the renderer migrates
// them to stored domains, the main process still serves the `listTickets` preset
// API for clients that have not migrated. Two copies of these equivalences would
// drift, and the drift is silent — a preset that compiles to a slightly different
// domain returns slightly different tickets, with nothing to raise.
import { CURRENT_USER_TOKEN } from './odoo-domain-tokens'
import { ODOO_CLOSED_STATES } from './odoo-types'
import type { OdooDomain, OdooTicketFilter } from './odoo-types'

const OPEN_STATE_DOMAIN: OdooDomain = [['state', 'not in', [...ODOO_CLOSED_STATES]]]

/**
 * No BASE_DOMAIN here: the read AND-composes that itself, and folding it in would
 * make the result unusable as a stored filter domain. No uid either: the preset
 * emits `CURRENT_USER_TOKEN`, which the read resolves against the instance it is
 * actually reading.
 */
export function filterDomain(filter: OdooTicketFilter): OdooDomain {
  if (filter === 'done') {
    return [['state', 'in', [...ODOO_CLOSED_STATES]]]
  }
  if (filter === 'assigned') {
    return [...OPEN_STATE_DOMAIN, ['user_ids', 'in', [CURRENT_USER_TOKEN]]]
  }
  if (filter === 'reported') {
    return [...OPEN_STATE_DOMAIN, ['create_uid', '=', CURRENT_USER_TOKEN]]
  }
  return [...OPEN_STATE_DOMAIN]
}
