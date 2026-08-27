// What the ticket read's domain will actually be: the raw domain and the selected
// facets, through the same compiler the read runs.
//
// The real compiler, not a parallel rendering of it. A second implementation
// would drift from what is sent, and a preview that lies is worse than none.
// Cheap enough to recompute per keystroke because it is pure — no read, no cache
// entry; only applying the domain touches either.
import { domainUsesOrcaToken } from '../../../shared/odoo-domain-tokens'
import { formatOdooDomainLiteralBlock } from '@/components/odoo-domain-literal-format'
import { compileOdooTicketFilterDomain } from '@/components/odoo-ticket-filter-domain'
import type { OdooTicketListFilters } from '@/components/odoo-ticket-facets'
import type { OdooDomain } from '../../../shared/odoo-types'

export type OdooAggregatedDomainPreview =
  | { ok: true; text: string; usesOrcaToken: boolean }
  | { ok: false; error: string }

/**
 * Not the whole story, on purpose: BASE_DOMAIN and the project scope are AND-ed
 * on server-side, per instance, and are not this compiler's output. The dialog
 * says so rather than this module inventing them — a fabricated leaf here would
 * be the same lie as a parallel compiler.
 */
export function aggregatedOdooDomainPreview(args: {
  filters: OdooTicketListFilters
  viewerUid?: number | null
  rawDomain: OdooDomain | null
}): OdooAggregatedDomainPreview {
  const compiled = compileOdooTicketFilterDomain(args)
  if (!compiled.ok) {
    return { ok: false, error: compiled.error }
  }
  return {
    ok: true,
    text: formatOdooDomainLiteralBlock(compiled.domain),
    usesOrcaToken: domainUsesOrcaToken(compiled.domain)
  }
}
