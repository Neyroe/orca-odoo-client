import { DEFAULT_ODOO_TICKET_FILTERS, type OdooTicketListFilters } from './odoo-ticket-facets'
import {
  parseAssignees,
  parsePriorities,
  parseProjects,
  parseStages,
  parseTags
} from './odoo-saved-ticket-filter-migrations'
import type { OdooTicketFilter } from '../../../shared/odoo-types'
const STORAGE_KEY = 'odoo.savedTicketFilters'
// Separate marker so an empty list means "the user cleared them", not "never
// seeded" — otherwise deleting the seeded entries would bring them straight back.
const SEEDED_STORAGE_KEY = 'odoo.savedTicketFilters.seeded'
/** Cap on stored entries. Exported so the trimming ends stay pinned by tests. */
export const MAX_SAVED_FILTERS = 30
const MAX_NAME_LENGTH = 60

/** A named preset + facet combination the user can recall in one click. */
export type OdooSavedTicketFilter = {
  id: string
  name: string
  preset: OdooTicketFilter
  filters: OdooTicketListFilters
  /** Starred entry applied when the panel opens; at most one across the list. */
  isDefault?: boolean
  /** Shown as a permanent chip in the toolbar rather than only in the menu. */
  pinned?: boolean
}

/** Presets seeded as real saved filters on first run, in chip order. */
export const ODOO_SEEDED_FILTER_PRESETS: readonly OdooTicketFilter[] = ['assigned', 'all']

const PRESETS: readonly OdooTicketFilter[] = ['assigned', 'reported', 'all', 'done']

function copyFilters(filters: OdooTicketListFilters): OdooTicketListFilters {
  return {
    stages: [...filters.stages],
    priorities: [...filters.priorities],
    assignees: [...filters.assignees],
    tags: [...filters.tags],
    projects: [...filters.projects]
  }
}

/** Order-insensitive set equality — the selection is a set, not a sequence. */
function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value))
}

/**
 * Identity is the normalised name, so re-saving under an existing name updates
 * that entry instead of piling up near-duplicates.
 */
export function odooSavedTicketFilterId(name: string): string {
  return name.trim().toLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseFilters(value: unknown): OdooTicketListFilters {
  if (!isRecord(value)) {
    return DEFAULT_ODOO_TICKET_FILTERS
  }
  return {
    stages: parseStages(value),
    priorities: parsePriorities(value),
    assignees: parseAssignees(value),
    tags: parseTags(value),
    projects: parseProjects(value)
  }
}

/** Tolerant of hand-edited or older payloads: unreadable entries are dropped. */
export function parseSavedOdooTicketFilters(raw: string | null): OdooSavedTicketFilter[] {
  if (!raw) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const seen = new Set<string>()
  const entries: OdooSavedTicketFilter[] = []
  // Only the first starred entry wins: a hand-edited file could star several,
  // and "the default" has to stay a single answer.
  let defaultClaimed = false
  for (const candidate of parsed) {
    if (!isRecord(candidate) || typeof candidate.name !== 'string') {
      continue
    }
    const name = candidate.name.trim().slice(0, MAX_NAME_LENGTH)
    const id = odooSavedTicketFilterId(name)
    if (!name || seen.has(id)) {
      continue
    }
    seen.add(id)
    entries.push({
      id,
      name,
      preset: PRESETS.includes(candidate.preset as OdooTicketFilter)
        ? (candidate.preset as OdooTicketFilter)
        : 'assigned',
      filters: parseFilters(candidate.filters),
      ...(candidate.isDefault === true && !defaultClaimed ? { isDefault: true } : {}),
      ...(candidate.pinned === true ? { pinned: true } : {})
    })
    if (candidate.isDefault === true) {
      defaultClaimed = true
    }
  }
  // Keep the newest, matching what upsert evicts. Trimming from the other end
  // would show the user a different set than the next save would preserve.
  return entries.slice(-MAX_SAVED_FILTERS)
}

export function upsertSavedOdooTicketFilter(
  saved: readonly OdooSavedTicketFilter[],
  entry: { name: string; preset: OdooTicketFilter; filters: OdooTicketListFilters }
): OdooSavedTicketFilter[] {
  const name = entry.name.trim().slice(0, MAX_NAME_LENGTH)
  if (!name) {
    return [...saved]
  }
  const id = odooSavedTicketFilterId(name)
  const existingIndex = saved.findIndex((candidate) => candidate.id === id)
  const next: OdooSavedTicketFilter = {
    id,
    name,
    preset: entry.preset,
    // One copy per facet: sharing any of these arrays would make two saved
    // entries alias one selection.
    filters: copyFilters(entry.filters),
    // Re-saving under an existing name keeps its star and pin rather than
    // demoting them.
    ...(existingIndex !== -1 && saved[existingIndex]?.isDefault ? { isDefault: true } : {}),
    ...(existingIndex !== -1 && saved[existingIndex]?.pinned ? { pinned: true } : {})
  }
  if (existingIndex !== -1) {
    const copy = [...saved]
    copy[existingIndex] = next
    return copy
  }
  return [...saved, next].slice(-MAX_SAVED_FILTERS)
}

/**
 * Stars one entry and clears every other star. Passing the already-starred id
 * unstars it, so the panel falls back to opening on the plain default filters.
 */
export function setDefaultSavedOdooTicketFilter(
  saved: readonly OdooSavedTicketFilter[],
  id: string
): OdooSavedTicketFilter[] {
  const alreadyDefault = saved.some((entry) => entry.id === id && entry.isDefault === true)
  return saved.map((entry) => {
    const { isDefault: _dropped, ...rest } = entry
    return !alreadyDefault && entry.id === id ? { ...rest, isDefault: true } : rest
  })
}

/** Pins or unpins one entry; pinned entries surface as toolbar chips. */
export function toggleSavedOdooTicketFilterPin(
  saved: readonly OdooSavedTicketFilter[],
  id: string
): OdooSavedTicketFilter[] {
  return saved.map((entry) => {
    if (entry.id !== id) {
      return entry
    }
    const { pinned: _dropped, ...rest } = entry
    return entry.pinned === true ? rest : { ...rest, pinned: true }
  })
}

/**
 * Moves one entry to another entry's slot. Stored order is the sequence the
 * menu lists and the toolbar chips follow, so reordering here is what the drag
 * handles write back — the Odoo `sequence` field in list form.
 */
export function reorderSavedOdooTicketFilters(
  saved: readonly OdooSavedTicketFilter[],
  activeId: string,
  overId: string
): OdooSavedTicketFilter[] {
  const from = saved.findIndex((entry) => entry.id === activeId)
  const to = saved.findIndex((entry) => entry.id === overId)
  if (from === -1 || to === -1 || from === to) {
    return [...saved]
  }
  const next = [...saved]
  const [moved] = next.splice(from, 1)
  if (!moved) {
    return [...saved]
  }
  next.splice(to, 0, moved)
  return next
}

export function getPinnedSavedOdooTicketFilters(
  saved: readonly OdooSavedTicketFilter[]
): OdooSavedTicketFilter[] {
  return saved.filter((entry) => entry.pinned === true)
}

export function getDefaultSavedOdooTicketFilter(
  saved: readonly OdooSavedTicketFilter[]
): OdooSavedTicketFilter | null {
  return saved.find((entry) => entry.isDefault === true) ?? null
}

export function removeSavedOdooTicketFilter(
  saved: readonly OdooSavedTicketFilter[],
  id: string
): OdooSavedTicketFilter[] {
  return saved.filter((entry) => entry.id !== id)
}

/** True when the toolbar currently reflects exactly what this entry stored. */
export function isSavedOdooTicketFilterActive(
  entry: OdooSavedTicketFilter,
  preset: OdooTicketFilter,
  filters: OdooTicketListFilters
): boolean {
  return (
    entry.preset === preset &&
    sameSelection(entry.filters.stages, filters.stages) &&
    sameSelection(entry.filters.priorities, filters.priorities) &&
    sameSelection(entry.filters.assignees, filters.assignees) &&
    sameSelection(entry.filters.tags, filters.tags) &&
    sameSelection(entry.filters.projects, filters.projects)
  )
}

/** Storage access throws when it is disabled or over quota; the save, pin, star,
 *  delete and reorder handlers must not break on that. */
function readStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Unavailable or full storage: the change stays in memory for this session.
  }
}

export function readSavedOdooTicketFilters(): OdooSavedTicketFilter[] {
  if (typeof window === 'undefined') {
    return []
  }
  return parseSavedOdooTicketFilters(readStorageItem(STORAGE_KEY))
}

export function writeSavedOdooTicketFilters(saved: readonly OdooSavedTicketFilter[]): void {
  if (typeof window === 'undefined') {
    return
  }
  writeStorageItem(STORAGE_KEY, JSON.stringify(saved))
}

/**
 * The two starter chips a fresh panel opens with. They are ordinary saved
 * filters — pinned, deletable, re-creatable — so the toolbar ships with
 * something useful without locking the user into it. The first one is starred,
 * which is what the panel restores on open.
 */
export function seedDefaultSavedOdooTicketFilters(
  labelFor: (preset: OdooTicketFilter) => string
): OdooSavedTicketFilter[] {
  return ODOO_SEEDED_FILTER_PRESETS.map((preset, index) => {
    const name = labelFor(preset).trim().slice(0, MAX_NAME_LENGTH)
    return {
      id: odooSavedTicketFilterId(name),
      name,
      preset,
      filters: copyFilters(DEFAULT_ODOO_TICKET_FILTERS),
      pinned: true,
      ...(index === 0 ? { isDefault: true } : {})
    }
  })
}

/**
 * Stored filters, seeding the starter chips the first time only. Once seeded,
 * an empty list stays empty — deleting the starters must make them stay gone.
 */
export function readOrSeedSavedOdooTicketFilters(
  labelFor: (preset: OdooTicketFilter) => string
): OdooSavedTicketFilter[] {
  if (typeof window === 'undefined') {
    return []
  }
  const stored = readSavedOdooTicketFilters()
  if (readStorageItem(SEEDED_STORAGE_KEY) === '1') {
    return stored
  }
  writeStorageItem(SEEDED_STORAGE_KEY, '1')
  if (stored.length > 0) {
    return stored
  }
  const seeded = seedDefaultSavedOdooTicketFilters(labelFor)
  writeSavedOdooTicketFilters(seeded)
  return seeded
}
