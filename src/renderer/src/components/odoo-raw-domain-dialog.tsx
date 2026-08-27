import React from 'react'

import { aggregatedOdooDomainPreview } from '@/components/odoo-aggregated-domain-preview'
import { formatOdooRawDomainBlock, parseOdooRawDomainText } from '@/components/odoo-raw-domain-text'
import {
  readOdooRawDomainSourceText,
  rememberOdooRawDomainSourceText
} from '@/components/odoo-raw-domain-source-text'
import { odooTicketFilterDomainsEqual } from '@/components/odoo-ticket-filter-domain'
import type { OdooTicketListFilters } from '@/components/odoo-ticket-facets'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { OdooDomain } from '../../../shared/odoo-types'

const PREVIEW_ID = 'odoo-raw-domain-dialog-preview'

/**
 * The raw domain with room to read it, and the aggregate it ends up in.
 *
 * Validated on every keystroke — the validator is renderer-side for exactly
 * this — but applied only on Apply: the read cache keys on `JSON.stringify`
 * over 500 entries with a 60s TTL, so a read per character would spend the whole
 * cache on half-typed domains. Enter stays a newline, since the point of the
 * editor is a domain written over several lines.
 */
export function OdooRawDomainDialog({
  open,
  onOpenChange,
  filters,
  viewerUid,
  rawDomain,
  onApply
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Facets the preview compiles alongside the domain, as the read does. */
  filters: OdooTicketListFilters
  viewerUid: number | null | undefined
  rawDomain: OdooDomain | null
  onApply: (domain: OdooDomain | null) => void
}): React.JSX.Element {
  // Whatever the user last wrote for this domain, or the domain pretty-printed —
  // which is also the answer for a filter saved before the text was remembered.
  const opened = (): string =>
    readOdooRawDomainSourceText(rawDomain) ?? formatOdooRawDomainBlock(rawDomain)
  const [draft, setDraft] = React.useState(opened)
  const [syncedOpen, setSyncedOpen] = React.useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) {
      setDraft(opened())
    }
  }

  const parsed = parseOdooRawDomainText(draft)
  const preview = parsed.ok
    ? aggregatedOdooDomainPreview({ filters, viewerUid, rawDomain: parsed.domain })
    : { ok: false as const, error: parsed.error }

  const apply = (): void => {
    if (!parsed.ok) {
      return
    }
    rememberOdooRawDomainSourceText(parsed.domain, draft)
    // Re-applying an unchanged domain would restart the read for nothing once
    // its cache entry has aged out.
    if (!odooTicketFilterDomainsEqual(parsed.domain, rawDomain)) {
      onApply(parsed.domain)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Scrolls itself on a short window; the domain block scrolls inside its own box. */}
      <DialogContent className="scrollbar-sleek max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.odoo.raw.domain.dialog.title', 'Custom domain')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.odoo.raw.domain.dialog.description',
              "Written the way Odoo writes it — [('s_raf', '>', 0)] — and narrowing the ticket read on top of the facets selected in the toolbar."
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label={translate('auto.components.odoo.raw.domain.dialog.label', 'Odoo domain')}
          aria-invalid={!preview.ok}
          aria-describedby={PREVIEW_ID}
          placeholder={translate(
            'auto.components.odoo.raw.domain.dialog.placeholder',
            "[\n  ('stage_id', '=', 103),\n  ('s_raf', '>', 0),\n]"
          )}
          className="min-h-40 font-mono text-xs"
        />
        {/* min-w-0: a grid item defaults to min-content, which a long domain would widen. */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {translate('auto.components.odoo.raw.domain.dialog.aggregate', 'Domain sent to Odoo')}
          </div>
          {preview.ok ? (
            <pre
              id={PREVIEW_ID}
              className="scrollbar-sleek max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground"
            >
              {preview.text}
            </pre>
          ) : (
            <p id={PREVIEW_ID} className="text-xs text-destructive">
              {preview.error}
            </p>
          )}
          {preview.ok && preview.usesOrcaToken ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.odoo.raw.domain.dialog.token',
                '$orca:me stands for the signed-in user and is resolved per instance when the read runs — a frozen user id would name a stranger on another database.'
              )}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.odoo.raw.domain.dialog.serverSide',
              'The template-task exclusion and the selected projects are added on top of this, server-side, per instance.'
            )}
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              {translate('auto.components.odoo.raw.domain.dialog.cancel', 'Cancel')}
            </Button>
          </DialogClose>
          <Button onClick={apply} disabled={!preview.ok}>
            {translate('auto.components.odoo.raw.domain.dialog.apply', 'Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
