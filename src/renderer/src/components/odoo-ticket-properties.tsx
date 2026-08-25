import { CalendarClock } from 'lucide-react'

import { OdooTicketAssigneePicker } from '@/components/odoo-ticket-assignee-picker'
import { ODOO_TICKET_CONTROL_WIDTH_CLASS } from '@/components/odoo-ticket-control-width'
import { OdooTicketStartWorkspaceButton } from '@/components/odoo-ticket-start-workspace-button'
import {
  ODOO_CUSTOMER_BADGE_CLASS,
  odooColorBadgeClass,
  odooDeadlineBadgeClass,
  odooStageBadgeClass
} from '@/components/odoo-badge-tones'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  OdooPriority,
  OdooStage,
  OdooTicket,
  OdooTicketUpdate
} from '../../../shared/odoo-types'

function getPriorityOptions(): { id: OdooPriority; label: string }[] {
  return [
    { id: '0', label: translate('auto.components.odoo.ticket.workspace.4411a54695', 'Low') },
    { id: '1', label: translate('auto.components.odoo.ticket.workspace.bcaea799c1', 'Medium') },
    { id: '2', label: translate('auto.components.odoo.ticket.workspace.2f1f13a17c', 'High') },
    { id: '3', label: translate('auto.components.odoo.ticket.workspace.1000c20873', 'Urgent') }
  ]
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

/**
 * Editable ticket metadata and badges. Lives at the top of the scrollable body
 * rather than in OdooTicketHeader: a 36px band cannot hold three w-40 controls
 * plus the title, and wrapping is what made the old header 200px tall.
 */
export function OdooTicketProperties({
  ticket,
  stages,
  saving,
  applyUpdate
}: {
  ticket: OdooTicket
  stages: OdooStage[]
  saving: boolean
  applyUpdate: (updates: OdooTicketUpdate, patch: Partial<OdooTicket>) => void
}): React.JSX.Element {
  const stageLabel = translate('auto.components.odoo.ticket.workspace.8229d636d2', 'Stage')
  const priorityLabel = translate('auto.components.odoo.ticket.workspace.9809e7ba90', 'Priority')
  return (
    <div className="flex flex-col gap-2">
      {/* No label spans: the selected value names each control, and dropping them
          is what keeps the three w-40 controls on one line at the panel's width. */}
      <div className="flex flex-wrap items-center gap-2">
        {stages.length > 0 ? (
          <Select
            value={ticket.stage ? String(ticket.stage.id) : undefined}
            disabled={saving}
            onValueChange={(value) => {
              const stage = stages.find((entry) => String(entry.id) === value)
              if (stage && stage.id !== ticket.stage?.id) {
                applyUpdate({ stageId: stage.id }, { stage })
              }
            }}
          >
            <SelectTrigger
              aria-label={stageLabel}
              title={stageLabel}
              className={cn('h-7 text-xs', ODOO_TICKET_CONTROL_WIDTH_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={String(stage.id)}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn('size-2 rounded-full border', odooStageBadgeClass(stage))}
                    />
                    {stage.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={ticket.priority}
          disabled={saving}
          onValueChange={(value) => {
            const priority = value as OdooPriority
            if (priority !== ticket.priority) {
              applyUpdate({ priority }, { priority })
            }
          }}
        >
          <SelectTrigger
            aria-label={priorityLabel}
            title={priorityLabel}
            className={cn('h-7 text-xs', ODOO_TICKET_CONTROL_WIDTH_CLASS)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getPriorityOptions().map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <OdooTicketAssigneePicker
          ticket={ticket}
          saving={saving}
          onChange={(assignees) =>
            applyUpdate({ assigneeIds: assignees.map((user) => user.id) }, { assignees })
          }
        />
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 pl-2">
          <OdooTicketStartWorkspaceButton ticket={ticket} />
        </div>
      </div>
      {ticket.customer || ticket.deadline || ticket.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {ticket.customer ? (
            <span
              className={cn(
                'inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium',
                ODOO_CUSTOMER_BADGE_CLASS
              )}
            >
              {translate('auto.components.odoo.ticket.header.4d59a1b53f', 'Customer')}:{' '}
              <span className="truncate">{ticket.customer.name}</span>
            </span>
          ) : null}
          {ticket.deadline ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                odooDeadlineBadgeClass(ticket.deadline)
              )}
            >
              <CalendarClock className="size-3" />
              {formatDeadline(ticket.deadline)}
            </span>
          ) : null}
          {ticket.tags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                'inline-flex max-w-[160px] items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-medium',
                odooColorBadgeClass(tag.color)
              )}
            >
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
