import { ODOO_CLOSED_STATES } from '../../../shared/odoo-types'
import type { OdooTicket } from '../../../shared/odoo-types'

/**
 * Safety invariant, not a filter concern: a ticket whose work is finished never
 * earns a workspace.
 *
 * It lives here rather than in the filter model because a filter built of facets
 * alone carries no state leaf, so any saved filter can legitimately return closed
 * tickets. The filter says what the user wants to see; this says what the
 * auto-create is allowed to act on.
 */
export function isOdooTicketClosed(ticket: Pick<OdooTicket, 'state'>): boolean {
  return ODOO_CLOSED_STATES.includes(ticket.state)
}

/**
 * The tickets this pass may act on at all, uncapped.
 *
 * A ticket that already has a linked workspace never re-triggers, and finished
 * work is refused whatever the filter returned.
 */
export function selectOdooAutoWorkspaceCandidates(
  tickets: readonly OdooTicket[],
  context: {
    /** Ticket ids already linked to a workspace, or already handled. */
    excludedTicketIds: ReadonlySet<number>
  }
): OdooTicket[] {
  return tickets.filter(
    (ticket) => !context.excludedTicketIds.has(ticket.id) && !isOdooTicketClosed(ticket)
  )
}

export type OdooAutoWorkspaceRunCap<T> = {
  selected: T[]
  /** Eligible but dropped by the cap — surfaced so the pass is never silent. */
  droppedByCap: number
}

/**
 * Bounds how many workspaces one pass may create.
 *
 * Applied after routing, not before: a ticket Orca has already refused to route
 * must not hold a slot that an actionable one behind it could have used.
 */
export function capOdooAutoWorkspaceRun<T>(
  items: readonly T[],
  maxPerRun: number
): OdooAutoWorkspaceRunCap<T> {
  if (maxPerRun <= 0) {
    return { selected: [], droppedByCap: 0 }
  }
  return {
    selected: items.slice(0, maxPerRun),
    droppedByCap: Math.max(0, items.length - maxPerRun)
  }
}
