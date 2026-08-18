import type { Worktree } from '../../../../shared/worktree/types'

export type OdooTicketTaskPageRequest = { id: number; instanceId?: string }

/**
 * The Tasks-page payload that opens a workspace's linked Odoo ticket. Reads the
 * `linkedOdooTicket` / `linkedOdooInstanceId` pair the sidebar card and the
 * stage sync already use, and returns null when there is nothing to open.
 */
export function buildOdooTicketTaskPageRequest(
  worktree: Pick<Worktree, 'linkedOdooTicket' | 'linkedOdooInstanceId'>
): OdooTicketTaskPageRequest | null {
  const id = worktree.linkedOdooTicket
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    return null
  }
  const instanceId = worktree.linkedOdooInstanceId?.trim()
  // Without the instance the read would hit whichever one is selected.
  return { id, ...(instanceId ? { instanceId } : {}) }
}
