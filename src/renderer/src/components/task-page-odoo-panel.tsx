import React, { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { OdooIcon } from '@/components/icons/OdooIcon'
import { OdooConnectDialog } from '@/components/odoo-connect-dialog'
import { OdooTicketWorkspace } from '@/components/odoo-ticket-workspace'
import { getOdooPresets } from '@/components/task-page-localized-options'
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
import type { OdooTicket, OdooTicketFilter } from '../../../shared/types'

const PRIORITY_TONES: Record<string, string> = {
  '0': 'bg-muted-foreground/40',
  '1': 'bg-sky-500/80',
  '2': 'bg-amber-500/80',
  '3': 'bg-red-500/80'
}

function formatUpdatedAt(updatedAt: string): string {
  const elapsed = Date.now() - new Date(updatedAt).getTime()
  const minutes = Math.round(elapsed / 60_000)
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.round(hours / 24)}d`
}

function OdooTicketRow({
  onOpen,
  selected,
  showInstanceContext,
  ticket
}: {
  onOpen: (ticket: OdooTicket) => void
  selected: boolean
  showInstanceContext: boolean
  ticket: OdooTicket
}): React.JSX.Element {
  const contextLabel = [showInstanceContext ? ticket.instanceName : null, ticket.project?.name]
    .filter(Boolean)
    .join(' / ')
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onOpen(ticket)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen(ticket)
        }
      }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50',
        selected && 'bg-muted/60'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          PRIORITY_TONES[ticket.priority] ?? PRIORITY_TONES['0']
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{ticket.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="shrink-0">{ticket.ref}</span>
          {contextLabel ? <span className="truncate">{contextLabel}</span> : null}
        </div>
      </div>
      {ticket.stage ? (
        <span className="shrink-0 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          {ticket.stage.name}
        </span>
      ) : null}
      <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground">
        {formatUpdatedAt(ticket.updatedAt)}
      </span>
    </div>
  )
}

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

  const presets = getOdooPresets()
  const instances = odooStatus.instances ?? []
  const selectedInstanceId = odooStatus.selectedInstanceId ?? odooStatus.activeInstanceId ?? null

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
    const read = appliedSearch
      ? searchOdooTickets([['name', 'ilike', appliedSearch]], 50)
      : listOdooTickets(preset, 50)
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
    <div className="mt-4 flex min-h-0 max-h-full flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm">
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
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setAppliedSearch(searchInput.trim())
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
                onClick={() => setRefreshNonce((n) => n + 1)}
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
          {tickets.length} {translate('auto.components.task.page.odoo.panel.42b63f8760', 'shown')}
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

        {!loading && tickets.length === 0 && !error && !odooStatus.credentialError ? (
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
          {tickets.map((ticket) => (
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
