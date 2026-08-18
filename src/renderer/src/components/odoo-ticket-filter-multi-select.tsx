import React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import type { OdooTicketFilterId } from '@/components/odoo-ticket-filter-select'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export type OdooTicketFilterMultiOption = {
  value: string
  label: string
  /**
   * Text the search box matches on, when it should be wider than the label —
   * a project also matches on its instance name. Must be unique per option:
   * Command keys its items by this, so two same-named projects on different
   * instances would otherwise collapse into one row.
   */
  searchText?: string
}

function optionSearchText(option: OdooTicketFilterMultiOption): string {
  return option.searchText ?? option.label
}

function triggerLabel(
  selected: readonly string[],
  options: readonly OdooTicketFilterMultiOption[],
  allLabel: string
): string {
  if (selected.length === 0) {
    return allLabel
  }
  const labelFor = (value: string): string =>
    options.find((option) => option.value === value)?.label ?? value
  const [first] = selected
  if (selected.length === 1) {
    return first ? labelFor(first) : allLabel
  }
  return translate(
    'auto.components.odoo.ticket.filter.multi.select.93e80c55c9',
    '{{value0}} +{{value1}}',
    { value0: labelFor(first ?? ''), value1: selected.length - 1 }
  )
}

/**
 * Multi-value facet dropdown for the ticket toolbar. Shares the toolbar's single
 * open slot with the instance select, so opening one still closes the others.
 *
 * Every facet carries a filter box, short lists included. Gating it on option
 * count was tried and rejected: whether a search field appeared then depended on
 * how many stages a project happened to have, and one consistent interaction on
 * every filter is what was asked for.
 */
export function OdooTicketFilterMultiSelect({
  id,
  openFilter,
  onOpenFilterChange,
  options,
  selected,
  onSelectedChange,
  allLabel,
  searchPlaceholder,
  triggerClassName,
  contentClassName
}: {
  id: string
  openFilter: OdooTicketFilterId
  onOpenFilterChange: (next: OdooTicketFilterId) => void
  options: readonly OdooTicketFilterMultiOption[]
  selected: readonly string[]
  onSelectedChange: (next: string[]) => void
  allLabel: string
  searchPlaceholder?: string
  triggerClassName?: string
  contentClassName?: string
}): React.JSX.Element {
  const toggle = (value: string): void => {
    onSelectedChange(
      selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]
    )
  }

  return (
    <Popover open={openFilter === id} onOpenChange={(next) => onOpenFilterChange(next ? id : null)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={openFilter === id}
          className={cn('h-7 justify-between gap-1 px-2 text-xs font-normal', triggerClassName)}
        >
          <span className="min-w-0 truncate">{triggerLabel(selected, options, allLabel)}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-56 p-0', contentClassName)}>
        {/* Command's own filtering drives the search box, so each item's `value` is
            the searchable text and selection goes through onSelect. */}
        <Command>
          <CommandInput
            placeholder={
              searchPlaceholder ??
              translate(
                'auto.components.odoo.ticket.filter.multi.select.searchPlaceholder',
                'Search…'
              )
            }
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty>
              {translate(
                'auto.components.odoo.ticket.filter.multi.select.3a02612aab',
                'Nothing to filter on.'
              )}
            </CommandEmpty>
            {/* The clear-all row keeps the `all` wording rather than a checkbox: it
                is the absence of a selection, not another value to combine. */}
            <CommandItem
              value={allLabel}
              onSelect={() => onSelectedChange([])}
              className="items-center gap-2 px-2 py-1.5 text-xs"
            >
              <Check
                className={cn(
                  'size-3 shrink-0 text-muted-foreground',
                  selected.length === 0 ? 'opacity-70' : 'opacity-0'
                )}
              />
              <span className="min-w-0 truncate">{allLabel}</span>
            </CommandItem>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={optionSearchText(option)}
                onSelect={() => toggle(option.value)}
                className="items-center gap-2 px-2 py-1.5 text-xs"
              >
                <Check
                  className={cn(
                    'size-3 shrink-0 text-muted-foreground',
                    selected.includes(option.value) ? 'opacity-70' : 'opacity-0'
                  )}
                />
                <span className="min-w-0 truncate" title={option.label}>
                  {option.label}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
