import { describe, expect, it } from 'vitest'

import { aggregatedOdooDomainPreview } from './odoo-aggregated-domain-preview'
import {
  DEFAULT_ODOO_TICKET_FILTERS,
  ODOO_UNASSIGNED_FILTER,
  type OdooTicketListFilters
} from './odoo-ticket-facets'
import type { OdooDomain } from '../../../shared/odoo-types'

function preview(
  filters: Partial<OdooTicketListFilters>,
  args: { viewerUid?: number | null; rawDomain?: OdooDomain | null } = {}
): ReturnType<typeof aggregatedOdooDomainPreview> {
  return aggregatedOdooDomainPreview({
    filters: { ...DEFAULT_ODOO_TICKET_FILTERS, ...filters },
    viewerUid: args.viewerUid,
    rawDomain: args.rawDomain ?? null
  })
}

describe('aggregatedOdooDomainPreview', () => {
  it('shows the raw domain and the selected facets as one domain', () => {
    expect(preview({ stages: ['Review'] }, { rawDomain: [['s_raf', '>', 0]] })).toEqual({
      ok: true,
      text: "[\n  ('stage_id.name', 'in', ['Review']),\n  ('s_raf', '>', 0)\n]",
      usesOrcaToken: false
    })
  })

  it('shows the match-everything domain rather than nothing', () => {
    expect(preview({})).toEqual({ ok: true, text: '[]', usesOrcaToken: false })
  })

  it('shows the current-user token, which is why the preview exists', () => {
    const shown = preview({ assignees: ['180'] }, { viewerUid: 180 })

    // A frozen uid would be wrong on another database, so the compiled domain
    // carries the token and the read resolves it per instance.
    expect(shown).toEqual({
      ok: true,
      text: "[\n  ('user_ids', 'in', ['$orca:me'])\n]",
      usesOrcaToken: true
    })
  })

  it('reports a plain uid as no token, so the note is not shown for one', () => {
    const shown = preview({ assignees: ['180'] }, { viewerUid: 42 })

    expect(shown).toEqual({
      ok: true,
      text: "[\n  ('user_ids', 'in', [180])\n]",
      usesOrcaToken: false
    })
  })

  it('keeps the operator of a compiled union readable', () => {
    expect(preview({ assignees: ['180', ODOO_UNASSIGNED_FILTER] }, { viewerUid: 180 })).toEqual({
      ok: true,
      text: "[\n  '|',\n  ('user_ids', 'in', ['$orca:me']),\n  ('user_ids', '=', False)\n]",
      usesOrcaToken: true
    })
  })

  it('shows the tag and priority facets too, in the order the read compiles them', () => {
    expect(preview({ tags: ['9'], priorities: ['1'], stages: ['Review'] })).toEqual({
      ok: true,
      text: [
        '[',
        "  ('stage_id.name', 'in', ['Review']),",
        "  ('priority', 'in', ['1']),",
        "  ('tag_ids', 'in', [9])",
        ']'
      ].join('\n'),
      usesOrcaToken: false
    })
  })

  it('says why there is no domain instead of showing an empty one', () => {
    expect(preview({ stages: ['Review'] }, { rawDomain: ['&', ['s_raf', '>', 0]] })).toEqual({
      ok: false,
      error: 'The "&" operator at position 0 is missing an operand.'
    })
  })
})
