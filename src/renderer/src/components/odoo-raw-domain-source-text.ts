// The text a raw domain was written as, kept so the editor hands back the line
// breaks and indentation the user typed rather than a re-serialized one-liner.
//
// Keyed on the domain, not on the saved filter holding it: the text is a
// *presentation* of that domain, so every path that produces the same domain —
// reopening the editor, recalling a saved filter, clicking a preset chip — shows
// the same formatting, and nothing has to be threaded through the filter schema.
// A domain with no entry (a filter written before this existed, a preset, another
// machine) falls back to the pretty-printed notation, which is the same answer
// this store would have given.
import type { OdooDomain } from '../../../shared/odoo-types'

const STORAGE_KEY = 'odoo.rawDomainSourceText'

/** Cap on remembered texts. Exported so the eviction end stays pinned by tests. */
export const MAX_ODOO_RAW_DOMAIN_SOURCE_TEXTS = 50

/** Oldest first, so trimming from the front evicts the least recently written. */
type SourceTextEntry = [domainKey: string, text: string]

/** The compiled domain's own cache key, so two spellings of one domain share a text. */
function domainKey(domain: OdooDomain | null | undefined): string | null {
  return domain && domain.length > 0 ? JSON.stringify(domain) : null
}

/** Storage throws when it is disabled or over quota; the editor must not break on that. */
function readStorage(): SourceTextEntry[] {
  try {
    return parseOdooRawDomainSourceTexts(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

/** Tolerant of a hand-edited payload: an unreadable pair is dropped, not kept. */
export function parseOdooRawDomainSourceTexts(raw: string | null): SourceTextEntry[] {
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
  return parsed.flatMap((entry) =>
    Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ? [[entry[0], entry[1]] as SourceTextEntry]
      : []
  )
}

export function readOdooRawDomainSourceText(domain: OdooDomain | null | undefined): string | null {
  const key = domainKey(domain)
  if (key === null || typeof window === 'undefined') {
    return null
  }
  return readStorage().find((entry) => entry[0] === key)?.[1] ?? null
}

/**
 * Remembers `text` as how `domain` is written. Called on apply, never on
 * keystroke — a text saved while it was half-typed would come back as the
 * formatting of a domain it does not spell.
 */
export function rememberOdooRawDomainSourceText(
  domain: OdooDomain | null | undefined,
  text: string
): void {
  const key = domainKey(domain)
  if (key === null || typeof window === 'undefined') {
    return
  }
  const kept = readStorage().filter((entry) => entry[0] !== key)
  const next = [...kept, [key, text] as SourceTextEntry].slice(-MAX_ODOO_RAW_DOMAIN_SOURCE_TEXTS)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Unavailable or full storage: the formatting lasts this session only.
  }
}
