// Readers for stored filter payloads written by older builds. Split out of
// odoo-saved-ticket-filters.ts so the legacy shapes sit together: every facet
// started life as a single value where 'all' meant "no filter", and each became a
// multi-select later, and a filter used to name a preset where it now carries the
// domain that preset stood for. An entry saved before a facet existed must widen
// to every value rather than inherit one.
import { parseOdooDomain } from '../../../shared/odoo-domain-validation'
import { filterDomain } from '../../../shared/odoo-filter-preset-domain'
import { ODOO_PRIORITIES } from '../../../shared/odoo-types'
import type { OdooDomain, OdooPriority, OdooTicketFilter } from '../../../shared/odoo-types'

function uniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
}

/**
 * The current array shape, or the pre-multi-select single value lifted into one.
 * `'all'` was the old "no filter" sentinel, so it reads as an empty selection.
 */
function parseFacetValues(
  value: Record<string, unknown>,
  arrayKey: string,
  legacyKey: string
): string[] {
  const current = uniqueStrings(value[arrayKey])
  if (current) {
    return current
  }
  const legacy = value[legacyKey]
  return typeof legacy === 'string' && legacy !== 'all' ? [legacy] : []
}

export function parseStages(value: Record<string, unknown>): string[] {
  return parseFacetValues(value, 'stages', 'stage')
}

export function parseProjects(value: Record<string, unknown>): string[] {
  return parseFacetValues(value, 'projects', 'project')
}

export function parseAssignees(value: Record<string, unknown>): string[] {
  return parseFacetValues(value, 'assignees', 'assignee')
}

export function parseTags(value: Record<string, unknown>): string[] {
  return parseFacetValues(value, 'tags', 'tag')
}

/** Same migration, plus a guard: an unknown priority code is dropped, not stored. */
export function parsePriorities(value: Record<string, unknown>): OdooPriority[] {
  return parseFacetValues(value, 'priorities', 'priority').filter((entry): entry is OdooPriority =>
    ODOO_PRIORITIES.includes(entry as OdooPriority)
  )
}

/** The four ids a stored `preset` could hold before filters carried a domain. */
const LEGACY_PRESETS: readonly OdooTicketFilter[] = ['assigned', 'reported', 'all', 'done']

/** `domain: undefined` is a filter that narrows by facets alone, which is legal. */
export type SavedTicketFilterDomain = { ok: true; domain: OdooDomain | undefined } | { ok: false }

/**
 * A raw domain as it should be stored, or `ok: false` for one Odoo would read
 * differently than its author meant.
 *
 * An empty domain is normalised away: it matches everything, so keeping it would
 * only perturb the read cache key it ends up in.
 */
export function normaliseRawTicketFilterDomain(value: unknown): SavedTicketFilterDomain {
  if (value === undefined || value === null) {
    return { ok: true, domain: undefined }
  }
  const checked = parseOdooDomain(value)
  if (!checked.ok) {
    return { ok: false }
  }
  return { ok: true, domain: checked.domain.length > 0 ? checked.domain : undefined }
}

/**
 * The domain a stored entry carries: its own `rawDomain`, or the one its legacy
 * `preset` stands for. `filterDomain` is the single source of those equivalences,
 * shared with the main process so the migrated filter reads the same set the
 * preset did.
 *
 * An unreadable domain fails the entry rather than dropping to the facets alone:
 * a filter that silently lost its narrowing would pull a wider set than the one
 * the user saved, which is exactly what "point at a saved filter by id" must not
 * do.
 */
export function parseSavedTicketFilterDomain(
  value: Record<string, unknown>
): SavedTicketFilterDomain {
  if (value.rawDomain !== undefined) {
    return normaliseRawTicketFilterDomain(value.rawDomain)
  }
  if (value.preset === undefined) {
    return { ok: true, domain: undefined }
  }
  // An unknown preset read as 'assigned' in the build that wrote the entry, so
  // that is the domain it was showing — a guess here, but the same one.
  const preset = LEGACY_PRESETS.includes(value.preset as OdooTicketFilter)
    ? (value.preset as OdooTicketFilter)
    : 'assigned'
  return { ok: true, domain: filterDomain(preset) }
}
