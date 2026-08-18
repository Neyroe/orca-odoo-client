// Readers for stored filter payloads written by older builds. Split out of
// odoo-saved-ticket-filters.ts so the five legacy shapes sit together: every facet
// started life as a single value where 'all' meant "no filter", and each became a
// multi-select later. An entry saved before a facet existed must widen to every
// value rather than inherit one.
import { ODOO_PRIORITIES } from '../../../shared/odoo-types'
import type { OdooPriority } from '../../../shared/odoo-types'

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
