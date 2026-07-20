import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { OdooIcon } from '@/components/icons/OdooIcon'
import { OdooConnectDialog } from '@/components/odoo-connect-dialog'
import { OdooTicketWorkspace } from '@/components/odoo-ticket-workspace'
import { deriveOdooTicketFacets, filterOdooTickets } from '@/components/odoo-ticket-facets'
import { OdooTicketRow } from '@/components/task-page-odoo-ticket-row'
import { getOdooPresets, getOdooPriorityLabels } from '@/components/task-page-localized-options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ODOO_PRIORITIES } from '../../../shared/odoo-types'
import type { OdooPriority, OdooTicket, OdooTicketFilter } from '../../../shared/types'

export function TaskPageOdooPanel({ onHide }: { onHide?: () => void }): React.JSX.Element {
  const odooStatus = useAppStore((s) => s.odooStatus)
  const odooStatusChecked = useAppStore((s) => s.odooStatusChecked)
  const checkOdooConnection = useAppStore((s) => s.checkOdooConnection)
  const listOdooTickets = useAppStore((s) => s.listOdooTickets)
  const searchOdooTickets = useAppStore((s) => s.searchOdooTickets)
  const selectOdooInstance = useAppStore((s) => s.selectOdooInstance)

  const [preset, setPreset] = useState<OdooTicketFilter>('assigned')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [tickets, setTickets] = useState<OdooTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [connectOpen, setConnectOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<OdooTicket | null>(null)
  // Client-side narrowing of the loaded set — instant and instance-agnostic.
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<OdooPriority | 'all'>('all')
  // Assignee/tag facets hold the selected id as a string ('all' = no filter).
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  // The Refresh button sets this so the next read bypasses the cache TTL.
  const forceNextReadRef = useRef(false)

  const presets = getOdooPresets()
  const priorityLabels = getOdooPriorityLabels()
  const instances = odooStatus.instances ?? []
  const selectedInstanceId = odooStatus.selectedInstanceId ?? odooStatus.activeInstanceId ?? null

  const resetFilters = (): void => {
    setStageFilter('all')
    setPriorityFilter('all')
    setAssigneeFilter('all')
    setTagFilter('all')
  }
  const facets = useMemo(() => deriveOdooTicketFacets(tickets), [tickets])
  const visibleTickets = useMemo(
    () =>
      filterOdooTickets(tickets, {
        stage: stageFilter,
        priority: priorityFilter,
        assignee: assigneeFilter,
        tag: tagFilter
      }),
    [tickets, stageFilter, priorityFilter, assigneeFilter, tagFilter]
  )

  useEffect(() => {
    void checkOdooConnection()
  }, [checkOdooConnection])

  useEffect(() => {
    if (!odooStatus.connected) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const forceRefresh = forceNextReadRef.current
    forceNextReadRef.current = false
    const read = appliedSearch
      ? searchOdooTickets([['name', 'ilike', appliedSearch]], 50, { forceRefresh })
      : listOdooTickets(preset, 50, { forceRefresh })
    read
      .then((result) => {
        if (!cancelled) {
          setTickets(result)
        }
      })
      .catch((readError: unknown) => {
        if (!cancelled) {
          setError(readError instanceof Error ? readError.message : String(readError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    odooStatus.connected,
    selectedInstanceId,
    preset,
    appliedSearch,
    refreshNonce,
    listOdooTickets,
    searchOdooTickets
  ])

  const patchListedTicket = (ticketId: number, patch: Partial<OdooTicket>): void => {
    setTickets((current) =>
      current.map((entry) => (entry.id === ticketId ? { ...entry, ...patch } : entry))
    )
    setSelectedTicket((current) => (current?.id === ticketId ? { ...current, ...patch } : current))
  }

  if (!odooStatusChecked) {
    return (
      <div className="mt-4 flex items-center justify-center py-14">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!odooStatus.connected) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center shadow-sm">
        <OdooIcon className="mb-4 size-8 text-muted-foreground/60" />
        <p className="text-base font-medium text-foreground">
          {translate('auto.components.task.page.odoo.panel.36a83d1d90', 'Connect your Odoo server')}
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {translate(
            'auto.components.task.page.odoo.panel.c172248418',
            'Browse, edit, and comment on Odoo tickets directly from here.'
          )}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => setConnectOpen(true)}>
            {translate('auto.components.task.page.odoo.panel.d0e1575687', 'Connect Odoo')}
          </Button>
          {onHide ? (
            <Button variant="outline" onClick={onHide}>
              {translate('auto.components.task.page.odoo.panel.546376384c', 'Hide Odoo')}
            </Button>
          ) : null}
        </div>
        <OdooConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      </div>
    )
  }

  return (
    <div
      data-odoo-panel="true"
      className="mt-4 flex min-h-0 max-h-full flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm"
    >
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/50 px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {presets.map((entry) => {
            const active = !appliedSearch && preset === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSearchInput('')
                  setAppliedSearch('')
                  setPreset(entry.id)
                  resetFilters()
                }}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs transition',
                  active
                    ? 'border-border/50 bg-foreground/90 text-background backdrop-blur-md'
                    : 'border-border/50 bg-transparent text-foreground hover:bg-muted/50'
                )}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {instances.length > 1 ? (
            <Select
              value={selectedInstanceId ?? undefined}
              onValueChange={(value) => {
                setSelectedTicket(null)
                setTickets([])
                resetFilters()
                void selectOdooInstance(value).catch(() => {
                  toast.error(
                    translate(
                      'auto.components.task.page.odoo.panel.85e1148843',
                      'Failed to switch Odoo instance.'
                    )
                  )
                })
              }}
            >
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate('auto.components.task.page.odoo.panel.83d54e0f6a', 'All instances')}
                </SelectItem>
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.database}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {facets.stages.length > 0 ? (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate('auto.components.task.page.odoo.panel.all_stages', 'All stages')}
                </SelectItem>
                {facets.stages.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {facets.assignees.length > 0 ? (
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate('auto.components.task.page.odoo.panel.all_assignees', 'All assignees')}
                </SelectItem>
                {facets.assignees.map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {facets.tags.length > 0 ? (
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate('auto.components.task.page.odoo.panel.all_tags', 'All tags')}
                </SelectItem>
                {facets.tags.map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={priorityFilter}
            onValueChange={(value) => setPriorityFilter(value as OdooPriority | 'all')}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {translate('auto.components.task.page.odoo.panel.all_priorities', 'All priorities')}
              </SelectItem>
              {ODOO_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priorityLabels[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setAppliedSearch(searchInput.trim())
              resetFilters()
            }}
          >
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={translate(
                'auto.components.task.page.odoo.panel.a0b20f5246',
                'Search tickets by title…'
              )}
              className="h-7 w-52 text-xs"
            />
          </form>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  forceNextReadRef.current = true
                  setRefreshNonce((n) => n + 1)
                }}
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

      <div className="flex h-10 flex-none items-center justify-between gap-3 border-b border-border/50 bg-muted/35 px-3">
        <div className="min-w-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {translate('auto.components.task.page.odoo.panel.93d245553c', 'Odoo tickets')}
        </div>
        <div className="shrink-0 text-[11px] text-muted-foreground">
          {visibleTickets.length}{' '}
          {translate('auto.components.task.page.odoo.panel.42b63f8760', 'shown')}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
        style={{ scrollbarGutter: 'stable' }}
      >
        {odooStatus.credentialError ? (
          <div className="border-b border-border px-4 py-4 text-sm text-destructive">
            {odooStatus.credentialError}
          </div>
        ) : null}
        {!odooStatus.credentialError && error ? (
          <div className="border-b border-border px-4 py-4 text-sm text-destructive">{error}</div>
        ) : null}

        {loading && tickets.length === 0 ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-3 py-3">
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
                <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted/60" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && visibleTickets.length === 0 && !error && !odooStatus.credentialError ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {translate('auto.components.task.page.odoo.panel.f5975fc3d1', 'No tickets found')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {translate(
                'auto.components.task.page.odoo.panel.7bb7235cda',
                'Try a different filter or search.'
              )}
            </p>
          </div>
        ) : null}

        <div className="divide-y divide-border/50">
          {visibleTickets.map((ticket) => (
            <OdooTicketRow
              key={`${ticket.instanceId ?? ''}:${ticket.id}`}
              ticket={ticket}
              selected={selectedTicket?.id === ticket.id}
              showInstanceContext={instances.length > 1}
              onOpen={setSelectedTicket}
            />
          ))}
        </div>
      </div>

      <OdooTicketWorkspace
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onTicketPatched={patchListedTicket}
      />
    </div>
  )
}
