// Shared arg-normalization for the Odoo IPC surface (odoo.ts and
// odoo-ticket-chatter.ts) — split out so neither handler file has to
// duplicate these small, security-relevant coercions.
import type { OdooInstanceSelection, OdooProjectScope } from '../../shared/odoo-types'
export function normalizeInstanceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeInstanceSelection(value: unknown): OdooInstanceSelection | undefined {
  return normalizeInstanceId(value) as OdooInstanceSelection | undefined
}

export function clampLimit(value: unknown, fallback = 30): number {
  const requested = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  // Odoo rejects a fractional `limit`, and the caller-supplied fallback is not
  // trusted either — truncate to an integer before clamping.
  const limit = Number.isFinite(requested) ? Math.trunc(requested) : 30
  return Math.min(Math.max(1, limit), 100)
}

/**
 * Odoo record ids are positive integers; anything else is a malformed call.
 * Beyond `Number.MAX_SAFE_INTEGER` JSON-RPC round trips lose precision and would
 * address a different record, so those are rejected too.
 */
export function normalizeRecordId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

export function normalizeIdArray(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  // `Array.from` visits holes as `undefined`; `map`/`every` would skip them and
  // let a sparse array through as a sparse result.
  const ids = Array.from(value, (item) => normalizeRecordId(item))
  return ids.every((id): id is number => id !== null) ? ids : undefined
}

/**
 * A malformed scope normalizes to `undefined` — an unscoped read — rather than to
 * a partial one: keeping the narrowing while dropping a bad id would silently
 * answer a different question than the caller asked.
 */
export function normalizeProjectScope(value: unknown): OdooProjectScope | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const input = value as { projectsByInstance?: unknown; includeNoProject?: unknown }
  if (!Array.isArray(input.projectsByInstance) || typeof input.includeNoProject !== 'boolean') {
    return undefined
  }
  const projectsByInstance: OdooProjectScope['projectsByInstance'] = []
  for (const entry of input.projectsByInstance) {
    if (!entry || typeof entry !== 'object') {
      return undefined
    }
    const instanceId = normalizeInstanceId((entry as { instanceId?: unknown }).instanceId)
    const projectIds = normalizeIdArray((entry as { projectIds?: unknown }).projectIds)
    if (!instanceId || projectIds === undefined) {
      return undefined
    }
    // An instance with an empty selection says nothing; carrying it would only
    // make the read look scoped to that instance.
    if (projectIds.length > 0) {
      projectsByInstance.push({ instanceId, projectIds })
    }
  }
  return projectsByInstance.length > 0 || input.includeNoProject
    ? { projectsByInstance, includeNoProject: input.includeNoProject }
    : undefined
}
