import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { OdooTicket } from '../../../shared/odoo-types'
import type { OdooTicketTaskPageRequest } from '@/components/sidebar/worktree-card-odoo-ticket-request'

/**
 * Loads a ticket the caller asked to open — a workspace's linked ticket reaching
 * the Tasks page — and hands it over once. Keyed on id + instance so a caller
 * that rebuilds the request object does not fight in-panel navigation.
 */
export function useRequestedOdooTicket(
  request: OdooTicketTaskPageRequest | null,
  onTicketLoaded: (ticket: OdooTicket) => void
): void {
  const fetchOdooTicket = useAppStore((s) => s.fetchOdooTicket)
  const requestedId = request?.id ?? null
  const requestedInstanceId = request?.instanceId ?? null
  useEffect(() => {
    if (requestedId === null) {
      return
    }
    let cancelled = false
    void fetchOdooTicket(requestedId, requestedInstanceId)
      .then((ticket) => {
        if (!cancelled && ticket) {
          onTicketLoaded(ticket)
        }
      })
      // The panel surfaces connection failures itself; a linked ticket that
      // cannot be read must not replace the list with an error.
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // onTicketLoaded is a setState updater from the caller — stable in practice,
    // and including it would re-fire the read on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOdooTicket, requestedId, requestedInstanceId])
}
