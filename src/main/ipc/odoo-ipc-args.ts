// Shared arg-normalization for the Odoo IPC surface (odoo.ts and
// odoo-ticket-chatter.ts) — split out so neither handler file has to
// duplicate these small, security-relevant coercions.
import type { OdooInstanceSelection } from '../../shared/odoo-types'
export function normalizeInstanceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeInstanceSelection(value: unknown): OdooInstanceSelection | undefined {
  return normalizeInstanceId(value) as OdooInstanceSelection | undefined
}

export function clampLimit(value: unknown, fallback = 30): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(1, limit), 100)
}

/** Odoo record ids are positive integers; anything else is a malformed call. */
export function normalizeRecordId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function normalizeIdArray(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const ids = value.map((item) => normalizeRecordId(item))
  return ids.every((id): id is number => id !== null) ? ids : undefined
}
