import type { OdooTicket } from '../../../shared/types'

/** Column key for tickets carrying no stage (private todos, for instance). */
export const ODOO_NO_STAGE_COLUMN = '__no_stage__'

export type OdooTicketStageColumn = {
  /** Stage id as a string, or ODOO_NO_STAGE_COLUMN. */
  key: string
  name: string
  sequence: number
  fold: boolean
  color?: number
  tickets: OdooTicket[]
}

/**
 * Groups the loaded tickets into kanban columns.
 *
 * Columns follow Odoo's own `project.task.type.sequence` rather than the
 * alphabetical facet order, so the board reads left-to-right like the Odoo
 * kanban it mirrors. Only stages present in the loaded set become columns —
 * the panel never fetches the full stage list for a mixed-project view.
 */
export function deriveOdooTicketStageColumns(tickets: OdooTicket[]): OdooTicketStageColumn[] {
  const columns = new Map<string, OdooTicketStageColumn>()
  for (const ticket of tickets) {
    const stage = ticket.stage
    const key = stage ? String(stage.id) : ODOO_NO_STAGE_COLUMN
    const existing = columns.get(key)
    if (existing) {
      existing.tickets.push(ticket)
      continue
    }
    columns.set(key, {
      key,
      name: stage?.name ?? '',
      // Unstaged tickets sort last: Odoo has no sequence to honour for them.
      sequence: stage?.sequence ?? Number.MAX_SAFE_INTEGER,
      fold: stage?.fold ?? false,
      ...(stage?.color !== undefined ? { color: stage.color } : {}),
      tickets: [ticket]
    })
  }
  return [...columns.values()].sort(
    (a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)
  )
}
