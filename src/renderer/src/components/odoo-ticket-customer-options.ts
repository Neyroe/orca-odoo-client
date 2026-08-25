import { odooCustomerRepoRouteKey } from '@/components/odoo-customer-repo-routes'
import type { OdooTicket } from '../../../shared/odoo-types'

export type OdooCustomerOption = { value: string; label: string }

/**
 * The customer companies present in the loaded tickets, keyed the way the
 * routing table keys them.
 *
 * Derived from the page like the facet option lists are: a company absent from
 * the current read is not offered here, while its stored row keeps routing. The
 * table is hand-written, so offering what is on screen is what makes a row
 * addable without knowing any Odoo id.
 */
export function deriveOdooCustomerOptions(
  tickets: readonly Pick<OdooTicket, 'instanceId' | 'customerCompany'>[]
): OdooCustomerOption[] {
  const labelByValue = new Map<string, string>()
  for (const ticket of tickets) {
    const value = odooCustomerRepoRouteKey(ticket.instanceId, ticket.customerCompany?.id)
    if (value && !labelByValue.has(value)) {
      labelByValue.set(value, ticket.customerCompany?.name ?? value)
    }
  }
  return [...labelByValue.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
