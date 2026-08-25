// Text ↔ Odoo domain for the toolbar's raw-domain box: the JSON layer the shared
// validator does not cover, plus the serialization the box reads back.
import { parseOdooDomain } from '../../../shared/odoo-domain-validation'
import { translate } from '@/i18n/i18n'
import type { OdooDomain } from '../../../shared/odoo-types'

export type OdooRawDomainTextResult =
  | { ok: true; domain: OdooDomain | null }
  | { ok: false; error: string }

/** What the box shows for a stored domain; empty text for none. */
export function formatOdooRawDomain(domain: OdooDomain | null | undefined): string {
  return domain && domain.length > 0 ? JSON.stringify(domain) : ''
}

/**
 * The domain `text` asks for, or why it cannot be one.
 *
 * `parseOdooDomain`'s message is returned verbatim — it is written for the user,
 * and the main process refuses the same domain in the same words, so rewording it
 * here would make one refusal read as two different problems.
 *
 * An empty domain answers `null`: `[]` matches everything, which is what "no raw
 * domain" already means to the compiler downstream.
 */
export function parseOdooRawDomainText(text: string): OdooRawDomainTextResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: true, domain: null }
  }
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    // Its own message: the shared validator never sees text, so all it could say
    // about a misplaced bracket is that this is not a list of conditions.
    return {
      ok: false,
      error: translate(
        'auto.components.odoo.raw.domain.text.invalidJson',
        'Write the domain as JSON, like [["s_raf", ">", 0]].'
      )
    }
  }
  const checked = parseOdooDomain(value)
  if (!checked.ok) {
    return { ok: false, error: checked.error }
  }
  return { ok: true, domain: checked.domain.length > 0 ? checked.domain : null }
}
