import React, { useState } from 'react'

import {
  DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS,
  ODOO_AUTO_WORKSPACE_MAX_PER_RUN,
  readOdooAutoWorkspaceSettings,
  writeOdooAutoWorkspaceSettings,
  type OdooAutoWorkspaceSettings
} from '@/components/odoo-auto-workspace-settings'
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
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ODOO_PRIORITIES } from '../../../shared/odoo-types'
import type { OdooPriority } from '../../../shared/odoo-types'
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

/** Configures the unattended workspace start: which repo, and what a ticket
 *  must look like to earn one. Off until a target repo is picked. */
export function OdooAutoWorkspaceDialog({
  open,
  onOpenChange,
  priorityLabels
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  priorityLabels: Record<OdooPriority, string>
}): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const [draft, setDraft] = useState<OdooAutoWorkspaceSettings>(readOdooAutoWorkspaceSettings)

  const patch = (updates: Partial<OdooAutoWorkspaceSettings>): void =>
    setDraft((current) => ({ ...current, ...updates }))
  const patchCriteria = (updates: Partial<OdooAutoWorkspaceSettings['criteria']>): void =>
    setDraft((current) => ({ ...current, criteria: { ...current.criteria, ...updates } }))

  const save = (): void => {
    const next = { ...draft, enabled: draft.enabled && draft.repoId !== null }
    writeOdooAutoWorkspaceSettings(next)
    setDraft(next)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(readOdooAutoWorkspaceSettings())
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.odoo.auto.workspace.title', 'Auto-start workspaces')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.odoo.auto.workspace.description',
              'Starts a workspace for matching tickets on each panel refresh. A ticket that already has one never starts a second.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border/60">
          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.enabled', 'Enabled')}
            hint={
              draft.repoId
                ? undefined
                : translate(
                    'auto.components.odoo.auto.workspace.needsRepo',
                    'Pick a target project first.'
                  )
            }
          >
            <Switch
              checked={draft.enabled && draft.repoId !== null}
              disabled={draft.repoId === null}
              onCheckedChange={(checked) => patch({ enabled: checked })}
            />
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.repo', 'Project')}
            hint={translate(
              'auto.components.odoo.auto.workspace.repoHint',
              'An Odoo ticket carries no repository, so the target is set here.'
            )}
          >
            <Select
              value={draft.repoId ?? ''}
              onValueChange={(value) => patch({ repoId: value || null })}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue
                  placeholder={translate(
                    'auto.components.odoo.auto.workspace.repoPlaceholder',
                    'Pick a project'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {repos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    {repo.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.baseBranch', 'Base branch')}
            hint={translate(
              'auto.components.odoo.auto.workspace.baseBranchHint',
              "Empty uses the project's default branch."
            )}
          >
            <Input
              value={draft.baseBranch}
              onChange={(event) => patch({ baseBranch: event.target.value })}
              className="h-8 w-52 text-xs"
            />
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.assigned', 'Assigned to me')}
          >
            <Switch
              checked={draft.criteria.assignedToMe}
              onCheckedChange={(checked) => patchCriteria({ assignedToMe: checked })}
            />
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.priority', 'Priority')}
            hint={translate(
              'auto.components.odoo.auto.workspace.priorityHint',
              'Any priority when none is picked.'
            )}
          >
            <div className="flex gap-1">
              {ODOO_PRIORITIES.map((priority) => {
                const active = draft.criteria.priorities.includes(priority)
                return (
                  <Button
                    key={priority}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="h-7 px-2 text-xs"
                    aria-pressed={active}
                    onClick={() =>
                      patchCriteria({
                        priorities: active
                          ? draft.criteria.priorities.filter((entry) => entry !== priority)
                          : [...draft.criteria.priorities, priority]
                      })
                    }
                  >
                    {priorityLabels[priority]}
                  </Button>
                )
              })}
            </div>
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.deadline', 'Due within (days)')}
            hint={translate(
              'auto.components.odoo.auto.workspace.deadlineHint',
              'Overdue tickets always match. Empty ignores deadlines.'
            )}
          >
            <Input
              type="number"
              min={0}
              value={draft.criteria.deadlineWithinDays ?? ''}
              onChange={(event) => {
                const raw = Number(event.target.value)
                patchCriteria({
                  deadlineWithinDays:
                    event.target.value === '' || !Number.isFinite(raw) || raw < 0 ? null : raw
                })
              }}
              className="h-8 w-24 text-xs"
            />
          </FieldRow>

          <FieldRow
            label={translate(
              'auto.components.odoo.auto.workspace.requireDescription',
              'Require a description'
            )}
          >
            <Switch
              checked={draft.criteria.requireDescription}
              onCheckedChange={(checked) => patchCriteria({ requireDescription: checked })}
            />
          </FieldRow>

          <FieldRow
            label={translate('auto.components.odoo.auto.workspace.cap', 'Max per refresh')}
            hint={translate(
              'auto.components.odoo.auto.workspace.capHint',
              'Bounds how many workspaces one over-broad rule can create.'
            )}
          >
            <Input
              type="number"
              min={0}
              max={ODOO_AUTO_WORKSPACE_MAX_PER_RUN}
              value={draft.maxPerRun}
              onChange={(event) => {
                const raw = Number(event.target.value)
                patch({
                  maxPerRun: Number.isFinite(raw)
                    ? Math.min(Math.max(Math.trunc(raw), 0), ODOO_AUTO_WORKSPACE_MAX_PER_RUN)
                    : DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS.maxPerRun
                })
              }}
              className="h-8 w-24 text-xs"
            />
          </FieldRow>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {translate('auto.components.odoo.auto.workspace.cancel', 'Cancel')}
          </Button>
          <Button onClick={save}>
            {translate('auto.components.odoo.auto.workspace.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
