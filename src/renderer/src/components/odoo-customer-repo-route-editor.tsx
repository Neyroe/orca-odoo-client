import React, { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'

import {
  odooCustomerRepoRouteTarget,
  removeOdooCustomerRepoRoute,
  upsertOdooCustomerRepoRoute,
  type OdooCustomerRepoRoute
} from '@/components/odoo-customer-repo-routes'
import {
  findOdooRepoRouteOption,
  odooRepoRouteOptions
} from '@/components/odoo-customer-repo-route-options'
import type { OdooCustomerOption } from '@/components/odoo-ticket-customer-options'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

/**
 * The hand-written customer-company → repo table.
 *
 * An Odoo ticket carries no repository, and one configured repo cannot serve
 * several clients, so the mapping is entered here. A company with no row starts
 * nothing rather than falling back to some repo.
 */
export function OdooCustomerRepoRouteEditor({
  routes,
  customers,
  onChange
}: {
  routes: readonly OdooCustomerRepoRoute[]
  customers: readonly OdooCustomerOption[]
  onChange: (routes: OdooCustomerRepoRoute[]) => void
}): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const repoOptions = useMemo(() => odooRepoRouteOptions(repos), [repos])
  const [draftCustomer, setDraftCustomer] = useState('')
  const [draftRepo, setDraftRepo] = useState('')

  const labelForCustomer = (route: OdooCustomerRepoRoute): string =>
    customers.find((candidate) => candidate.value === route.customer)?.label ??
    // Stored at write time precisely for this: a company absent from the current
    // page still has to read as a name, not as an instance-qualified id.
    route.customerName ??
    route.customer

  const unmapped = customers.filter(
    (candidate) => !routes.some((route) => route.customer === candidate.value)
  )

  const addRoute = (): void => {
    const repo = repoOptions.find((option) => option.value === draftRepo)
    const customer = unmapped.find((option) => option.value === draftCustomer)
    if (!repo || !customer) {
      return
    }
    onChange(
      upsertOdooCustomerRepoRoute(routes, {
        customer: customer.value,
        customerName: customer.label,
        ...odooCustomerRepoRouteTarget(repo.repo)
      })
    )
    setDraftCustomer('')
    setDraftRepo('')
  }

  return (
    <div className="space-y-2 py-2">
      <div className="text-sm text-foreground">
        {translate('auto.components.odoo.customer.repo.route.editor.title', 'Client → project')}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.odoo.customer.repo.route.editor.hint',
          'A ticket starts in the project mapped to its client. A client with no row here starts nothing.'
        )}
      </p>

      {routes.length > 0 ? (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60">
          {routes.map((route) => {
            const option = findOdooRepoRouteOption(repoOptions, route)
            return (
              <li key={route.customer} className="flex items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {labelForCustomer(route)}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${
                    option ? 'text-muted-foreground' : 'text-destructive'
                  }`}
                >
                  {option
                    ? option.label
                    : // The row still routes nowhere until the repo comes back, so
                      // say which one is missing instead of showing a blank cell.
                      translate(
                        'auto.components.odoo.customer.repo.route.editor.missingRepo',
                        'Missing project ({{value0}})',
                        { value0: route.repoId }
                      )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 p-0"
                  aria-label={translate(
                    'auto.components.odoo.customer.repo.route.editor.remove',
                    'Remove mapping'
                  )}
                  onClick={() => onChange(removeOdooCustomerRepoRoute(routes, route.customer))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.odoo.customer.repo.route.editor.empty',
            'No mapping yet — nothing will start.'
          )}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Select value={draftCustomer} onValueChange={setDraftCustomer}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue
              placeholder={translate(
                'auto.components.odoo.customer.repo.route.editor.pickCustomer',
                'Client'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {unmapped.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draftRepo} onValueChange={setDraftRepo}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue
              placeholder={translate(
                'auto.components.odoo.customer.repo.route.editor.pickRepo',
                'Project'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {repoOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 text-xs"
          disabled={!draftCustomer || !draftRepo}
          onClick={addRoute}
        >
          {translate('auto.components.odoo.customer.repo.route.editor.add', 'Add')}
        </Button>
      </div>

      {customers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.odoo.customer.repo.route.editor.noCustomers',
            'Clients are offered from the tickets currently loaded — refresh the list to see more.'
          )}
        </p>
      ) : null}
    </div>
  )
}
