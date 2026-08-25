import React from 'react'

import { formatOdooRawDomain, parseOdooRawDomainText } from '@/components/odoo-raw-domain-text'
import { odooTicketFilterDomainsEqual } from '@/components/odoo-ticket-filter-domain'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { OdooDomain } from '../../../shared/odoo-types'

const ERROR_ID = 'odoo-raw-domain-error'

/**
 * Free-text Odoo domain, AND-ed into the ticket read on top of the facets.
 *
 * This is how a filter reaches a field Orca knows nothing about: a domain narrows
 * on `s_raf` without `s_raf` ever being in the read's `fields`, so no schema has
 * to be taught to the client first.
 *
 * Applied on Enter or blur, never per keystroke — the list cache keys on
 * `JSON.stringify(domain)` with a 60s TTL over 500 entries, so a read per
 * character would spend the whole cache on half-typed domains.
 *
 * Checked before it is applied, with the same validator the main process runs: an
 * invalid domain that reaches IPC comes back wrapped as "Error invoking remote
 * method …", and the sentence the user needs is buried inside it.
 */
export function OdooRawDomainInput({
  rawDomain,
  filtersActive,
  onApply
}: {
  rawDomain: OdooDomain | null
  /** False while a title search drives the read, so this domain is not in effect. */
  filtersActive: boolean
  onApply: (domain: OdooDomain | null) => void
}): React.JSX.Element {
  const applied = formatOdooRawDomain(rawDomain)
  const [draft, setDraft] = React.useState(applied)
  const [error, setError] = React.useState<string | null>(null)
  const [syncedFrom, setSyncedFrom] = React.useState(applied)
  // A preset chip and a recalled saved filter both write this domain from
  // outside; the box follows them rather than keeping the text it was left with.
  if (applied !== syncedFrom) {
    setSyncedFrom(applied)
    setDraft(applied)
    setError(null)
  }

  const apply = (): void => {
    const parsed = parseOdooRawDomainText(draft)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    // Blur fires on any incidental focus loss. Re-applying an unchanged domain
    // would restart the read for nothing once its cache entry has aged out.
    if (!odooTicketFilterDomainsEqual(parsed.domain, rawDomain)) {
      onApply(parsed.domain)
    }
  }

  // A title search replaces the compiled domain rather than narrowing it, so the
  // box goes inert: an editable one would read as describing rows it has no part
  // in, and its error would blame a domain nothing is running.
  const shownError = filtersActive ? error : null

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        disabled={!filtersActive}
        aria-invalid={shownError !== null}
        aria-describedby={shownError ? ERROR_ID : undefined}
        aria-label={translate('auto.components.odoo.raw.domain.input.label', 'Odoo domain')}
        placeholder={translate(
          'auto.components.odoo.raw.domain.input.placeholder',
          '[["x_field", ">", 0]]'
        )}
        className="h-7 w-64 font-mono text-[11px]"
      />
      {shownError ? (
        <p id={ERROR_ID} className="w-64 text-xs text-destructive">
          {shownError}
        </p>
      ) : null}
    </form>
  )
}
