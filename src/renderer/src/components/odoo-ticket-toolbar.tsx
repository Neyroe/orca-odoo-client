import React from 'react'
import { Columns3, List, RefreshCw, Zap } from 'lucide-react'

import {
  OdooTicketFilterSelect,
  type OdooTicketFilterId
} from '@/components/odoo-ticket-filter-select'
import {
  ODOO_NO_PROJECT_FILTER,
  ODOO_UNASSIGNED_FILTER,
  odooProjectFilterOptions,
  type OdooTicketFacets,
  type OdooTicketListFilters
} from '@/components/odoo-ticket-facets'
import { OdooTicketFilterMultiSelect } from '@/components/odoo-ticket-filter-multi-select'
import { OdooRawDomainInput } from '@/components/odoo-raw-domain-input'
import { OdooAutoWorkspaceDialog } from '@/components/odoo-auto-workspace-dialog'
import { OdooSavedFilterMenu } from '@/components/odoo-saved-filter-menu'
import {
  getPinnedSavedOdooTicketFilters,
  isSavedOdooTicketFilterActive,
  type OdooSavedTicketFilter
} from '@/components/odoo-saved-ticket-filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ODOO_PRIORITIES } from '../../../shared/odoo-types'
import type {
  OdooDomain,
  OdooInstance,
  OdooPriority,
  OdooProject,
  OdooTicketFilter
} from '../../../shared/odoo-types'
export type OdooTicketToolbarProps = {
  presets: { id: OdooTicketFilter; label: string }[]
  /** Preset whose domain the toolbar currently sits on, if any. */
  activePreset: OdooTicketFilter | null
  /** False while a title search drives the read, so no saved view is applied. */
  filtersActive: boolean
  onPresetSelect: (preset: OdooTicketFilter) => void
  instances: OdooInstance[]
  selectedInstanceId: string | null
  onInstanceSelect: (instanceId: string) => void
  facets: OdooTicketFacets
  /** Projects of the scoped instance, for the project selector. */
  projects: OdooProject[]
  filters: OdooTicketListFilters
  /** Raw domain the toolbar narrows by on top of the facets, if any. */
  rawDomain: OdooDomain | null
  /** Applies what the raw-domain box holds; null for no raw domain. */
  onRawDomainChange: (domain: OdooDomain | null) => void
  onFilterChange: <K extends keyof OdooTicketListFilters>(
    key: K,
    value: OdooTicketListFilters[K]
  ) => void
  openFilter: OdooTicketFilterId
  onOpenFilterChange: (next: OdooTicketFilterId) => void
  priorityLabels: Record<OdooPriority, string>
  searchInput: string
  onSearchInputChange: (value: string) => void
  onSearchSubmit: () => void
  loading: boolean
  onRefresh: () => void
  savedFilters: OdooSavedTicketFilter[]
  onApplySavedFilter: (entry: OdooSavedTicketFilter) => void
  onSaveFilter: (name: string) => void
  onDeleteSavedFilter: (id: string) => void
  onSetDefaultSavedFilter: (id: string) => void
  onTogglePinnedSavedFilter: (id: string) => void
  onReorderSavedFilters: (activeId: string, overId: string) => void
  view: OdooTicketPanelView
  onViewChange: (view: OdooTicketPanelView) => void
}

/** List or kanban, the way Odoo lets you switch view on the same records. */
export type OdooTicketPanelView = 'list' | 'kanban'

/** Preset chips, facet dropdowns, title search and refresh for the ticket list. */
export function OdooTicketToolbar({
  presets,
  activePreset,
  filtersActive,
  onPresetSelect,
  instances,
  selectedInstanceId,
  onInstanceSelect,
  facets,
  projects,
  filters,
  rawDomain,
  onRawDomainChange,
  onFilterChange,
  openFilter,
  onOpenFilterChange,
  priorityLabels,
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  loading,
  onRefresh,
  savedFilters,
  onApplySavedFilter,
  onSaveFilter,
  onDeleteSavedFilter,
  onSetDefaultSavedFilter,
  onTogglePinnedSavedFilter,
  onReorderSavedFilters,
  view,
  onViewChange
}: OdooTicketToolbarProps): React.JSX.Element {
  const menu = { openFilter, onOpenFilterChange }
  const [autoWorkspaceOpen, setAutoWorkspaceOpen] = React.useState(false)
  const pinnedFilters = getPinnedSavedOdooTicketFilters(savedFilters)
  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/50 px-3 py-2">
      {/* Pinned saved filters stay visible as chips; the rest live in the menu. */}
      <div className="flex flex-wrap items-center gap-2">
        {pinnedFilters.map((entry) => {
          const active = filtersActive && isSavedOdooTicketFilterActive(entry, filters, rawDomain)
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onApplySavedFilter(entry)}
              className={cn(
                'max-w-44 truncate rounded-md border px-2 py-1 text-xs transition',
                active
                  ? 'border-border/50 bg-foreground/90 text-background backdrop-blur-md'
                  : 'border-border/50 bg-transparent text-foreground hover:bg-muted/50'
              )}
            >
              {entry.name}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {instances.length > 1 ? (
          <OdooTicketFilterSelect
            {...menu}
            id="instance"
            triggerClassName="w-44"
            value={selectedInstanceId ?? 'all'}
            onValueChange={onInstanceSelect}
            options={[
              {
                value: 'all',
                label: translate('auto.components.task.page.odoo.panel.83d54e0f6a', 'All instances')
              },
              ...instances.map((instance) => ({ value: instance.id, label: instance.database }))
            ]}
          />
        ) : null}
        {projects.length > 0 ? (
          <OdooTicketFilterMultiSelect
            {...menu}
            id="project"
            triggerClassName="w-44"
            contentClassName="w-72"
            searchPlaceholder={translate(
              'auto.components.odoo.ticket.toolbar.searchProjects',
              'Search projects…'
            )}
            options={[
              {
                value: ODOO_NO_PROJECT_FILTER,
                label: translate('auto.components.odoo.ticket.toolbar.noProject', 'No project')
              },
              ...odooProjectFilterOptions(projects, instances.length > 1)
            ]}
            selected={filters.projects}
            onSelectedChange={(next) => onFilterChange('projects', next)}
            allLabel={translate('auto.components.odoo.ticket.toolbar.allProjects', 'All projects')}
          />
        ) : null}
        {facets.stages.length > 0 ? (
          <OdooTicketFilterMultiSelect
            {...menu}
            id="stage"
            triggerClassName="w-36"
            searchPlaceholder={translate(
              'auto.components.odoo.ticket.toolbar.searchStages',
              'Search stages…'
            )}
            options={facets.stages.map((stage) => ({ value: stage, label: stage }))}
            selected={filters.stages}
            onSelectedChange={(next) => onFilterChange('stages', next)}
            allLabel={translate('auto.components.odoo.ticket.toolbar.9be2437ce8', 'All stages')}
          />
        ) : null}
        {facets.assignees.length > 0 ? (
          <OdooTicketFilterMultiSelect
            {...menu}
            id="assignee"
            triggerClassName="w-36"
            searchPlaceholder={translate(
              'auto.components.odoo.ticket.toolbar.searchAssignees',
              'Search assignees…'
            )}
            options={[
              {
                value: ODOO_UNASSIGNED_FILTER,
                label: translate('auto.components.odoo.ticket.toolbar.d60356cf84', 'Unassigned')
              },
              ...facets.assignees.map((option) => ({
                value: String(option.id),
                label: option.label
              }))
            ]}
            selected={filters.assignees}
            onSelectedChange={(next) => onFilterChange('assignees', next)}
            allLabel={translate('auto.components.odoo.ticket.toolbar.43754b421e', 'All assignees')}
          />
        ) : null}
        {facets.tags.length > 0 ? (
          <OdooTicketFilterMultiSelect
            {...menu}
            id="tag"
            triggerClassName="w-32"
            searchPlaceholder={translate(
              'auto.components.odoo.ticket.toolbar.searchTags',
              'Search tags…'
            )}
            options={facets.tags.map((option) => ({
              value: String(option.id),
              label: option.label
            }))}
            selected={filters.tags}
            onSelectedChange={(next) => onFilterChange('tags', next)}
            allLabel={translate('auto.components.odoo.ticket.toolbar.484da6b802', 'All tags')}
          />
        ) : null}
        <OdooTicketFilterMultiSelect
          {...menu}
          id="priority"
          triggerClassName="w-28"
          contentClassName="w-44"
          searchPlaceholder={translate(
            'auto.components.odoo.ticket.toolbar.searchPriorities',
            'Search priorities…'
          )}
          options={ODOO_PRIORITIES.map((priority) => ({
            value: priority,
            label: priorityLabels[priority]
          }))}
          selected={filters.priorities}
          onSelectedChange={(next) => onFilterChange('priorities', next as OdooPriority[])}
          allLabel={translate('auto.components.odoo.ticket.toolbar.7f31abc4a5', 'All priorities')}
        />
        <OdooSavedFilterMenu
          saved={savedFilters}
          presets={presets}
          activePreset={activePreset}
          filtersActive={filtersActive}
          onPresetSelect={onPresetSelect}
          filters={filters}
          rawDomain={rawDomain}
          onApply={onApplySavedFilter}
          onSave={onSaveFilter}
          onDelete={onDeleteSavedFilter}
          onSetDefault={onSetDefaultSavedFilter}
          onTogglePinned={onTogglePinnedSavedFilter}
          onReorder={onReorderSavedFilters}
        />
        <OdooRawDomainInput
          rawDomain={rawDomain}
          filtersActive={filtersActive}
          onApply={onRawDomainChange}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSearchSubmit()
          }}
        >
          <Input
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder={translate(
              'auto.components.task.page.odoo.panel.a0b20f5246',
              'Search tickets by title…'
            )}
            className="h-7 w-52 text-xs"
          />
        </form>
        <div
          className="flex items-center gap-0.5 rounded-md border border-border/60 p-0.5"
          role="group"
          aria-label={translate('auto.components.odoo.ticket.toolbar.7d46008d09', 'Ticket view')}
        >
          {/* Kanban leads: it is the panel's default view. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={view === 'kanban'}
            title={translate('auto.components.odoo.ticket.toolbar.53d7b66f1b', 'Kanban')}
            aria-label={translate('auto.components.odoo.ticket.toolbar.53d7b66f1b', 'Kanban')}
            className={cn('size-6', view === 'kanban' && 'bg-accent')}
            onClick={() => onViewChange('kanban')}
          >
            <Columns3 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={view === 'list'}
            title={translate('auto.components.odoo.ticket.toolbar.a65ddcf2d6', 'List')}
            aria-label={translate('auto.components.odoo.ticket.toolbar.a65ddcf2d6', 'List')}
            className={cn('size-6', view === 'list' && 'bg-accent')}
            onClick={() => onViewChange('list')}
          >
            <List className="size-3.5" />
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              // Tooltip content is not an accessible name, so the icon-only
              // button carries its own label.
              aria-label={translate(
                'auto.components.odoo.ticket.toolbar.2fa7507b51',
                'Auto-start workspaces'
              )}
              onClick={() => setAutoWorkspaceOpen(true)}
            >
              <Zap className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('auto.components.odoo.ticket.toolbar.2fa7507b51', 'Auto-start workspaces')}
          </TooltipContent>
        </Tooltip>
        <OdooAutoWorkspaceDialog
          open={autoWorkspaceOpen}
          onOpenChange={setAutoWorkspaceOpen}
          priorityLabels={priorityLabels}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={translate('auto.components.task.page.odoo.panel.56db121047', 'Refresh')}
              onClick={onRefresh}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('auto.components.task.page.odoo.panel.56db121047', 'Refresh')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
