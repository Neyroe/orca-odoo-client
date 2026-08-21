import type { WorktreeNavHistoryEntry } from '@/store/slices/worktree-nav-history'
import type { OdooTicket } from '../../../shared/odoo-types'

export type OdooPanelTicketCloseAction = 'return-to-workspace' | 'none'

function isSameTicket(a: OdooTicket, b: OdooTicket): boolean {
  // Numeric ids collide across instances, so the instance is part of the identity.
  return a.id === b.id && (a.instanceId ?? null) === (b.instanceId ?? null)
}

/**
 * What closing the ticket panel should do. Closing the ticket a workspace asked
 * for leaves the Tasks page entirely and returns to that workspace — the whole
 * point of the workspace entry point; a ticket picked from the list closes in
 * place.
 */
export function planOdooPanelTicketClose(args: {
  closing: OdooTicket | null
  requested: OdooTicket | null
  currentEntry: WorktreeNavHistoryEntry | null
  historyIndex: number
}): OdooPanelTicketCloseAction {
  const { closing, requested, currentEntry, historyIndex } = args
  if (!closing || !requested || !isSameTicket(closing, requested)) {
    return 'none'
  }
  const parkedOnTicketDetail =
    typeof currentEntry === 'object' &&
    currentEntry !== null &&
    currentEntry.kind === 'task-detail' &&
    currentEntry.source === 'odoo'
  // Without a previous entry there is nowhere to return to.
  return parkedOnTicketDetail && historyIndex > 0 ? 'return-to-workspace' : 'none'
}
