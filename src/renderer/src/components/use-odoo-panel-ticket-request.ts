import { useCallback, useEffect } from 'react'

import { planOdooPanelTicketClose } from '@/components/odoo-panel-ticket-close-plan'
import { useAppStore } from '@/store'
import type { OdooTicket } from '../../../shared/odoo-types'

/**
 * A workspace can ask the panel to open one ticket without going through the
 * list (`taskPageData.openOdooTicket`). Returns the panel's close handler, which
 * hands navigation back to the workspace that asked.
 */
export function useOdooPanelTicketRequest(
  selectedTicket: OdooTicket | null,
  setSelectedTicket: (ticket: OdooTicket | null) => void
): () => void {
  const requestedTicket = useAppStore((s) => s.taskPageData.openOdooTicket)

  // Why: the request is not consumed here — TaskPage remounts this panel right
  // after the navigation (the provider tab resolves a render later), and a
  // request cleared before that remount leaves the ticket unopened.
  useEffect(() => {
    if (requestedTicket) {
      setSelectedTicket(requestedTicket)
    }
  }, [requestedTicket, setSelectedTicket])

  return useCallback(() => {
    setSelectedTicket(null)
    const state = useAppStore.getState()
    const plan = planOdooPanelTicketClose({
      closing: selectedTicket,
      requested: state.taskPageData.openOdooTicket ?? null,
      currentEntry: state.worktreeNavHistory[state.worktreeNavHistoryIndex] ?? null,
      historyIndex: state.worktreeNavHistoryIndex
    })
    // Closing drops the request: left in place it reopens the ticket on the next
    // mount, and makes re-asking for that same ticket a no-op — the read cache
    // hands back the very object already stored.
    if (state.taskPageData.openOdooTicket) {
      useAppStore.setState((s) => ({
        taskPageData: { ...s.taskPageData, openOdooTicket: undefined }
      }))
    }
    // closeTaskPage (not goBackWorktree): the Tasks visit and the ticket detail
    // are two history entries, so a single step back only reaches the list.
    if (plan === 'return-to-workspace') {
      state.closeTaskPage()
    }
  }, [selectedTicket, setSelectedTicket])
}
