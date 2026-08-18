import type {
  OdooPriority,
  OdooProject,
  OdooProjectScope,
  OdooTicket
} from '../../../shared/odoo-types'
export type OdooTicketFacetOption = { id: number; label: string }

export type OdooTicketFacets = {
  stages: string[]
  assignees: OdooTicketFacetOption[]
  tags: OdooTicketFacetOption[]
}

export type OdooTicketListFilters = {
  /**
   * Every facet uses the same convention: an EMPTY selection means the facet is
   * inactive (all values), and several selected values read as a union. Across
   * facets the selections read as a conjunction — Odoo's own search-panel
   * semantics.
   */
  stages: string[]
  priorities: OdooPriority[]
  /** User ids as strings, plus `ODOO_UNASSIGNED_FILTER` for tickets nobody owns. */
  assignees: string[]
  tags: string[]
  /**
   * `<instanceId>:<projectId>` pairs and/or the no-project sentinel. Unlike its
   * neighbours this one is applied by the server (see `OdooProjectScope`), not by
   * `filterOdooTickets`.
   */
  projects: string[]
}

/**
 * Sentinel assignee value matching tickets nobody owns. Odoo has no user id to
 * select for that, so the filter needs its own token alongside 'all'.
 */
export const ODOO_UNASSIGNED_FILTER = 'unassigned'

/**
 * Sentinel project value matching tickets that carry no project — Odoo's private
 * todos (`project_todo`). No project id can express it, so it needs its own
 * token alongside 'all'.
 */
export const ODOO_NO_PROJECT_FILTER = 'noProject'

/**
 * Filter value for one project, or `null` for a project that cannot be scoped to.
 *
 * The instance id travels with the value because `project.project` ids are
 * per-database: a bare id recalled on another instance would scope the view to an
 * unrelated project. Instance ids are base64url, so ':' cannot occur inside one.
 *
 * `null` rather than a value with an empty instance id: an unscopeable project must
 * be left out of the selector, not offered as an option that reads as a project
 * scope while the read goes out unscoped.
 */
export function odooProjectFilterValue(
  project: Pick<OdooProject, 'id' | 'instanceId'>
): string | null {
  return project.instanceId ? `${project.instanceId}:${project.id}` : null
}

/** One value's instance/project pair, or `null` if it is not a project value. */
function parseOdooProjectFilterValue(
  value: string
): { instanceId: string; projectId: number } | null {
  const separator = value.lastIndexOf(':')
  if (separator <= 0) {
    return null
  }
  const instanceId = value.slice(0, separator)
  const projectId = Number(value.slice(separator + 1))
  return Number.isSafeInteger(projectId) && projectId > 0 ? { instanceId, projectId } : null
}

/**
 * The read scope a selection asks for, or `null` when it asks for none.
 *
 * Ids are grouped per instance so each connected instance is narrowed by its own
 * ids and never by a colliding id from another database.
 */
export function parseOdooProjectFilters(values: readonly string[]): OdooProjectScope | null {
  const idsByInstance = new Map<string, number[]>()
  let includeNoProject = false
  for (const value of values) {
    if (value === ODOO_NO_PROJECT_FILTER) {
      includeNoProject = true
      continue
    }
    const parsed = parseOdooProjectFilterValue(value)
    if (!parsed) {
      continue
    }
    const ids = idsByInstance.get(parsed.instanceId)
    if (ids) {
      if (!ids.includes(parsed.projectId)) {
        ids.push(parsed.projectId)
      }
    } else {
      idsByInstance.set(parsed.instanceId, [parsed.projectId])
    }
  }
  if (idsByInstance.size === 0 && !includeNoProject) {
    return null
  }
  return {
    projectsByInstance: [...idsByInstance.entries()].map(([instanceId, projectIds]) => ({
      instanceId,
      projectIds
    })),
    includeNoProject
  }
}

export const DEFAULT_ODOO_TICKET_FILTERS: OdooTicketListFilters = {
  stages: [],
  priorities: [],
  assignees: [],
  tags: [],
  projects: []
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

/**
 * Project options for the toolbar's project facet.
 *
 * A project with no instance id is left out: its value cannot name an instance, so
 * offering it would read as a scope the read never applies. The instance name is
 * folded into the label only when it disambiguates — two instances can each hold a
 * project called "Internal" — and always into the search text.
 */
export function odooProjectFilterOptions(
  projects: readonly OdooProject[],
  showInstance: boolean
): { value: string; label: string; searchText: string }[] {
  return projects.flatMap((project) => {
    const value = odooProjectFilterValue(project)
    if (!value) {
      return []
    }
    const label =
      showInstance && project.instanceName
        ? `${project.name} (${project.instanceName})`
        : project.name
    // The value is appended so two same-named projects on different instances stay
    // distinct Command items; nobody types a base64url instance id, so it never
    // widens a search in practice.
    return [{ value, label, searchText: `${project.name} ${project.instanceName ?? ''} ${value}` }]
  })
}

/**
 * The subset of a selection the loaded project list can still resolve. Values
 * naming a project this instance does not have — typically saved against another
 * instance — are dropped; the rest of the selection is kept rather than cleared
 * wholesale.
 *
 * Only meaningful once the project list has actually loaded; the caller checks
 * that, because dropping entries on a failed read would widen the view silently.
 * The no-project sentinel always survives: it resolves against nothing.
 */
export function retainResolvableOdooProjectFilters(
  values: readonly string[],
  projects: readonly OdooProject[]
): string[] {
  const resolvable = new Set(
    projects.flatMap((project) => {
      const value = odooProjectFilterValue(project)
      return value ? [value] : []
    })
  )
  return values.filter((value) => value === ODOO_NO_PROJECT_FILTER || resolvable.has(value))
}

/** The values a ticket carries for one facet; empty means it can match none. */
function ticketFacetValues(
  ticket: OdooTicket,
  facet: 'stages' | 'priorities' | 'assignees' | 'tags'
): string[] {
  if (facet === 'stages') {
    return ticket.stage ? [ticket.stage.name] : []
  }
  if (facet === 'priorities') {
    return [ticket.priority]
  }
  if (facet === 'tags') {
    return ticket.tags.map((tag) => String(tag.id))
  }
  // A ticket nobody owns carries the sentinel instead of an id, so selecting
  // 'unassigned' alongside a user reads as "unowned OR that user".
  return ticket.assignees.length === 0
    ? [ODOO_UNASSIGNED_FILTER]
    : ticket.assignees.map((user) => String(user.id))
}

function matchesFacet(selected: readonly string[], carried: readonly string[]): boolean {
  return selected.length === 0 || selected.some((value) => carried.includes(value))
}

/**
 * Client-side narrowing of the loaded set. An empty selection means the facet is
 * inactive; several values within one facet read as a union, and the facets read
 * as a conjunction — same semantics as Odoo's search panel. A ticket carrying no
 * value for an active facet (a stage-less ticket under a stage selection) is out.
 *
 * `projects` is deliberately absent: it is narrowed by the Odoo domain before the
 * read's limit applies. Re-applying it here would look like a safety net while
 * actually hiding truncation — a project with 40 open tickets would show however
 * many landed on the preset's first page.
 */
export function filterOdooTickets(
  tickets: OdooTicket[],
  filters: OdooTicketListFilters
): OdooTicket[] {
  return tickets.filter(
    (ticket) =>
      matchesFacet(filters.stages, ticketFacetValues(ticket, 'stages')) &&
      matchesFacet(filters.priorities, ticketFacetValues(ticket, 'priorities')) &&
      matchesFacet(filters.assignees, ticketFacetValues(ticket, 'assignees')) &&
      matchesFacet(filters.tags, ticketFacetValues(ticket, 'tags'))
  )
}
