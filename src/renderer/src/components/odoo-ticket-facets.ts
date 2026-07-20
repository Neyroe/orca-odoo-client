import type { OdooPriority, OdooTicket } from '../../../shared/types'

export type OdooTicketFacetOption = { id: number; label: string }

export type OdooTicketFacets = {
  stages: string[]
  assignees: OdooTicketFacetOption[]
  tags: OdooTicketFacetOption[]
}

export type OdooTicketListFilters = {
  stage: string
  priority: OdooPriority | 'all'
  assignee: string
  tag: string
}

function toSortedOptions(source: Map<number, string>): OdooTicketFacetOption[] {
  return [...source.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Derives the assignee/tag/stage filter options present in the loaded set. */
export function deriveOdooTicketFacets(tickets: OdooTicket[]): OdooTicketFacets {
  const stages = new Set<string>()
  const assignees = new Map<number, string>()
  const tags = new Map<number, string>()
  for (const ticket of tickets) {
    if (ticket.stage) {
      stages.add(ticket.stage.name)
    }
    for (const user of ticket.assignees) {
      if (!assignees.has(user.id)) {
        assignees.set(user.id, user.displayName)
      }
    }
    for (const tag of ticket.tags) {
      if (!tags.has(tag.id)) {
        tags.set(tag.id, tag.name)
      }
    }
  }
  return {
    stages: [...stages].sort((a, b) => a.localeCompare(b)),
    assignees: toSortedOptions(assignees),
    tags: toSortedOptions(tags)
  }
}

/** Client-side narrowing of the loaded set; 'all' means the facet is inactive. */
export function filterOdooTickets(
  tickets: OdooTicket[],
  filters: OdooTicketListFilters
): OdooTicket[] {
  return tickets.filter(
    (ticket) =>
      (filters.stage === 'all' || ticket.stage?.name === filters.stage) &&
      (filters.priority === 'all' || ticket.priority === filters.priority) &&
      (filters.assignee === 'all' ||
        ticket.assignees.some((user) => String(user.id) === filters.assignee)) &&
      (filters.tag === 'all' || ticket.tags.some((tag) => String(tag.id) === filters.tag))
  )
}
