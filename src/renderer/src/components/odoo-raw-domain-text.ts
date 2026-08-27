// Text ↔ Odoo domain for the raw-domain box and its editor: the notation layer
// the shared validator does not cover, plus the serialization the box reads back.
import { parseOdooDomain } from '../../../shared/odoo-domain-validation'
import {
  formatOdooDomainLiteral,
  formatOdooDomainLiteralBlock
} from '@/components/odoo-domain-literal-format'
import { parseOdooDomainLiteral } from '@/components/odoo-domain-literal-parse'
import type { OdooDomain } from '../../../shared/odoo-types'

export type OdooRawDomainTextResult =
  | { ok: true; domain: OdooDomain | null }
  | { ok: false; error: string }

/** What the box shows for a stored domain; empty text for none. */
export function formatOdooRawDomain(domain: OdooDomain | null | undefined): string {
  return domain && domain.length > 0 ? formatOdooDomainLiteral(domain) : ''
}

/** The same domain over several lines, for the editor's first draft of it. */
export function formatOdooRawDomainBlock(domain: OdooDomain | null | undefined): string {
  return domain && domain.length > 0 ? formatOdooDomainLiteralBlock(domain) : ''
}

/**
 * The domain `text` asks for, or why it cannot be one.
 *
 * Two layers, two authors of the message. `parseOdooDomainLiteral` situates what
 * the domain layer never sees — an unclosed bracket, a bare word — by character.
 * `parseOdooDomain`'s message is returned verbatim: it is written for the user,
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
  const literal = parseOdooDomainLiteral(trimmed)
  if (!literal.ok) {
    return { ok: false, error: literal.error }
  }
  const checked = parseOdooDomain(literal.value)
  if (!checked.ok) {
    return { ok: false, error: checked.error }
  }
  return { ok: true, domain: checked.domain.length > 0 ? checked.domain : null }
}
