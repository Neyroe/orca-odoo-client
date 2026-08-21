import React, { useCallback } from 'react'
import { toast } from 'sonner'

import { OdooIcon } from '@/components/icons/OdooIcon'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  getWorkspaceLinkedOdooTicket,
  type WorkspaceLinkedOdooTicket
} from './workspace-linked-odoo-ticket'
import type { Worktree } from '../../../../shared/worktree/types'

/** Degraded path: the stored ticket plus its browser link, never an error. */
function toastStoredTicket(link: WorkspaceLinkedOdooTicket): void {
  const url = link.url
  toast(
    link.title ??
      translate(
        'auto.components.sidebar.WorkspaceLinkedOdooTicketMenuItem.storedTicket',
        'Odoo ticket {{value0}}',
        { value0: link.ref }
      ),
    {
      description: translate(
        'auto.components.sidebar.WorkspaceLinkedOdooTicketMenuItem.unavailable',
        'Odoo could not be read, so {{value0}} cannot open in Orca right now.',
        { value0: link.ref }
      ),
      ...(url
        ? {
            action: {
              label: translate(
                'auto.components.sidebar.WorkspaceLinkedOdooTicketMenuItem.openInBrowser',
                'Open in Odoo'
              ),
              onClick: () => void window.api.shell.openUrl(url)
            }
          }
        : {})
    }
  )
}

/**
 * Reads the workspace's linked ticket in Orca instead of hopping to the browser.
 * The ticket resolves through the link's own instance and source identity, not
 * whichever instance the Tasks panel happens to have selected.
 */
export function WorkspaceLinkedOdooTicketMenuItem({
  worktree,
  disabled
}: {
  worktree: Worktree
  disabled?: boolean
}): React.JSX.Element | null {
  const connected = useAppStore((s) => s.odooStatus.connected)
  const fetchOdooTicket = useAppStore((s) => s.fetchOdooTicket)
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const link = getWorkspaceLinkedOdooTicket(worktree)

  const openLinkedTicket = useCallback(
    async (target: WorkspaceLinkedOdooTicket): Promise<void> => {
      if (!connected) {
        toastStoredTicket(target)
        return
      }
      const ticket = await fetchOdooTicket(target.id, target.instanceId, {
        sourceContext: target.sourceContext
      }).catch(() => null)
      if (!ticket) {
        toastStoredTicket(target)
        return
      }
      openTaskPage({ taskSource: 'odoo', openOdooTicket: ticket })
    },
    [connected, fetchOdooTicket, openTaskPage]
  )

  if (!link) {
    return null
  }

  return (
    <DropdownMenuItem onSelect={() => void openLinkedTicket(link)} disabled={disabled}>
      <OdooIcon className="size-3.5" />
      {translate(
        'auto.components.sidebar.WorkspaceLinkedOdooTicketMenuItem.open',
        'Open Odoo ticket {{value0}}',
        { value0: link.ref }
      )}
    </DropdownMenuItem>
  )
}
