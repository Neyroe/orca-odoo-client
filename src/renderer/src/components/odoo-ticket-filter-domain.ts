// Compiles the toolbar's facet selection — and any raw domain the active saved
// filter carries — into the single Odoo domain a ticket read sends.
//
// One engine on purpose. The facets used to narrow the fetched page here in the
// renderer while only the preset reached the server, so "7 shown" meant "7 of the
// first 50 rows", never "7 in the database". A server-side domain removes that
// whole class of miscount.
//
// Version skew, both directions: a compiled domain carrying `$orca:me` is refused
// loudly by `assertCurrentUserTokenSupported` when the paired host predates
// `odoo.domain-tokens.v1`, and an older client keeps calling the preset RPC the
// host still serves. Neither pairing reads the wrong tickets silently.
import { CURRENT_USER_TOKEN } from '../../../shared/odoo-domain-tokens'
import { andGroupedDomain, parseOdooDomain } from '../../../shared/odoo-domain-validation'
import { ODOO_UNASSIGNED_FILTER, type OdooTicketListFilters } from './odoo-ticket-facets'
import type { OdooDomain } from '../../../shared/odoo-types'

export type OdooTicketFilterDomainResult =
  | { ok: true; domain: OdooDomain }
  | { ok: false; error: string }

/**
 * De-duplicated and sorted by code unit — not `localeCompare`, whose order
 * depends on the user's locale and would compile one selection into two
 * different domains, hence two entries of the read cache keyed on its JSON.
 */
function sortedValues(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

/** Ascending and numeric: id 10 must not sort ahead of id 9. */
function sortedIds(values: readonly string[]): number[] {
  const ids = values.flatMap((value) => {
    const id = Number(value)
    // A non-numeric selection would serialise to null and filter on nothing.
    return Number.isSafeInteger(id) && id > 0 ? [id] : []
  })
  return [...new Set(ids)].sort((a, b) => a - b)
}

/**
 * `['user_ids', 'in', ids]`, the unowned leaf, or their union.
 *
 * The signed-in user leaves as `CURRENT_USER_TOKEN` rather than as their uid:
 * `OdooInstance.uid` is resolved per instance at connect time, so a stored id
 * reads as whichever stranger holds it on the next database — no error, just
 * another user's tickets. The token leads the list so the same selection always
 * serialises the same way.
 */
function assigneeDomain(
  selected: readonly string[],
  viewerUid: number | null | undefined
): OdooDomain {
  const includeUnassigned = selected.includes(ODOO_UNASSIGNED_FILTER)
  const ids = sortedIds(selected.filter((value) => value !== ODOO_UNASSIGNED_FILTER))
  const values: unknown[] =
    viewerUid != null && ids.includes(viewerUid)
      ? [CURRENT_USER_TOKEN, ...ids.filter((id) => id !== viewerUid)]
      : ids
  const owned = values.length > 0 ? ['user_ids', 'in', values] : null
  const unowned = includeUnassigned ? ['user_ids', '=', false] : null
  if (owned && unowned) {
    return ['|', owned, unowned]
  }
  const leaf = owned ?? unowned
  return leaf ? [leaf] : []
}

/**
 * The domain a selection asks for. Never throws: an unreadable raw domain comes
 * back as `ok: false` so the caller can say what is wrong instead of running a
 * read Odoo would read differently than its author meant.
 *
 * Facet order is fixed (stages, priorities, assignees, tags, then the raw
 * domain) and every value list is sorted, because the list cache keys on
 * `JSON.stringify(domain)`: an unstable compilation would mine two entries of a
 * 500-entry cache for one filter.
 *
 * Fragments are concatenated flat. Each is self-balanced, and Odoo ANDs the
 * top-level operands — which `readWithDomain` then makes explicit by grouping the
 * whole thing before composing it with BASE_DOMAIN and the project scope.
 */
export function compileOdooTicketFilterDomain(args: {
  filters: OdooTicketListFilters
  viewerUid?: number | null
  rawDomain?: OdooDomain | null
}): OdooTicketFilterDomainResult {
  const { filters, viewerUid, rawDomain } = args
  const domain: OdooDomain = []
  if (filters.stages.length > 0) {
    // Stages travel by name: `project.task.type` ids are per-database, so a
    // stored id would name another stage on the next instance.
    domain.push(['stage_id.name', 'in', sortedValues(filters.stages)])
  }
  if (filters.priorities.length > 0) {
    domain.push(['priority', 'in', sortedValues(filters.priorities)])
  }
  domain.push(...assigneeDomain(filters.assignees, viewerUid))
  const tagIds = sortedIds(filters.tags)
  if (tagIds.length > 0) {
    domain.push(['tag_ids', 'in', tagIds])
  }
  // `filters.projects` is deliberately not compiled: `projectScopeDomain` is
  // already server-side and instance-aware, and answers `null` for an instance
  // holding nothing selected — which skips that instance's round trip entirely.
  if (!rawDomain || rawDomain.length === 0) {
    return { ok: true, domain }
  }
  const checked = parseOdooDomain(rawDomain)
  if (!checked.ok) {
    return { ok: false, error: checked.error }
  }
  // Grouped: a raw domain whose operators are unbalanced within itself would
  // otherwise reach past its own end and swallow a facet leaf.
  return { ok: true, domain: [...domain, ...andGroupedDomain(rawDomain)] }
}

/** Whether two stored domains ask the same question; absent reads as empty. */
export function odooTicketFilterDomainsEqual(
  left: OdooDomain | null | undefined,
  right: OdooDomain | null | undefined
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
}
