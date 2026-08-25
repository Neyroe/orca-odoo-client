import React, { useState } from 'react'

import {
  DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS,
  ODOO_AUTO_WORKSPACE_MAX_PER_RUN,
  readOdooAutoWorkspaceSettings,
  writeOdooAutoWorkspaceSettings,
  type OdooAutoWorkspaceSettings
} from '@/components/odoo-auto-workspace-settings'
import { OdooCustomerRepoRouteEditor } from '@/components/odoo-customer-repo-route-editor'
import {
  readOdooCustomerRepoRoutes,
  writeOdooCustomerRepoRoutes,
  type OdooCustomerRepoRoute
} from '@/components/odoo-customer-repo-routes'
import type { OdooSavedTicketFilter } from '@/components/odoo-saved-ticket-filters'
import type { OdooCustomerOption } from '@/components/odoo-ticket-customer-options'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
function FieldRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * Configures the unattended workspace start: which saved filter arms it, and
 * which project each client's tickets land in.
 *
 * The filter is referenced by id rather than copied, so editing it in the
 * toolbar changes what is armed — and what starts work stays the same question
 * the kanban answers.
 */
export function OdooAutoWorkspaceDialog({
  open,
  onOpenChange,
  savedFilters,
  customers
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  savedFilters: readonly OdooSavedTicketFilter[]
  customers: readonly OdooCustomerOption[]
}): React.JSX.Element {
  const [draft, setDraft] = useState<OdooAutoWorkspaceSettings>(readOdooAutoWorkspaceSettings)
  const [routes, setRoutes] = useState<readonly OdooCustomerRepoRoute[]>(readOdooCustomerRepoRoutes)

  const patch = (updates: Partial<OdooAutoWorkspaceSettings>): void =>
    setDraft((current) => ({ ...current, ...updates }))

  // A filter that no longer exists cannot arm anything, so it reads as unset
  // rather than as a name the picker has no row for.
  const selectedFilterId =
    draft.savedFilterId && savedFilters.some((entry) => entry.id === draft.savedFilterId)
      ? draft.savedFilterId
      : null

  const save = (): void => {
    const next = {
      ...draft,
      savedFilterId: selectedFilterId,
      enabled: draft.enabled && selectedFilterId !== null
    }
    writeOdooAutoWorkspaceSettings(next)
    writeOdooCustomerRepoRoutes(routes)
    setDraft(next)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(readOdooAutoWorkspaceSettings())
          setRoutes(readOdooCustomerRepoRoutes())
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.odoo.auto.workspace.dialog.def72a8110',
              'Auto-start workspaces'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.odoo.auto.workspace.dialog.b32ad78d76',
              'Starts a workspace for the tickets a saved filter returns. A ticket that already has one never starts a second, and a closed one never starts any.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border/60">
          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.dialog.6183b72801', 'Enabled')}
            hint={
              selectedFilterId
                ? undefined
                : translate(
                    'auto.components.odoo.auto.workspace.dialog.pick_filter',
                    'Pick a saved filter first.'
                  )
            }
          >
            <Switch
              checked={draft.enabled && selectedFilterId !== null}
              disabled={selectedFilterId === null}
              onCheckedChange={(checked) => patch({ enabled: checked })}
            />
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.dialog.filter', 'Saved filter')}
            hint={translate(
              'auto.components.odoo.auto.workspace.dialog.filter_hint',
              'Exactly the tickets this filter returns — editing it changes what starts.'
            )}
          >
            <Select
              value={selectedFilterId ?? ''}
              onValueChange={(value) => patch({ savedFilterId: value || null })}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue
                  placeholder={translate(
                    'auto.components.odoo.auto.workspace.dialog.pick_filter_placeholder',
                    'Pick a filter'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {savedFilters.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            label={translate(
              'auto.components.odoo.auto.workspace.dialog.b4667b375d',
              'Max per refresh'
            )}
            hint={translate(
              'auto.components.odoo.auto.workspace.dialog.18d16befe4',
              'Bounds how many workspaces one over-broad filter can create.'
            )}
          >
            <Input
              type="number"
              min={1}
              max={ODOO_AUTO_WORKSPACE_MAX_PER_RUN}
              value={draft.maxPerRun}
              onChange={(event) => {
                // `Number('')` is 0, and a cap of 0 selects no candidate at all —
                // clearing the field must not silently disarm an enabled rule.
                const raw = Number(event.target.value)
                const cleared = event.target.value.trim() === ''
                patch({
                  maxPerRun:
                    cleared || !Number.isFinite(raw)
                      ? DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS.maxPerRun
                      : Math.min(Math.max(Math.trunc(raw), 1), ODOO_AUTO_WORKSPACE_MAX_PER_RUN)
                })
              }}
              className="h-8 w-24 text-xs"
            />
          </FieldRow>

          <OdooCustomerRepoRouteEditor routes={routes} customers={customers} onChange={setRoutes} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {translate('auto.components.odoo.auto.workspace.dialog.06bb829452', 'Cancel')}
          </Button>
          <Button onClick={save}>
            {translate('auto.components.odoo.auto.workspace.dialog.f2040d28d3', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
