import { ExternalLink, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { OdooTicket } from '../../../shared/odoo-types'

export function OdooTicketHeader({
  ticket,
  pager,
  onClose
}: {
  ticket: OdooTicket
  /** Ticket-list navigation slot; the header lays it out but does not own it. */
  pager?: React.ReactNode
  onClose: () => void
}): React.JSX.Element {
  const context = [ticket.ref, ticket.project?.name].filter(Boolean).join(' · ')
  return (
    <div
      className="flex h-9 min-h-9 flex-none items-center gap-2 border-b border-border/50 px-2"
      // Why: the panel is a right-edge sheet, so this band sits under the fixed
      // .window-controls overlay (z-9999). 0px on macOS and paired web clients.
      style={{ paddingRight: 'max(0.5rem, var(--window-controls-width, 0px))' }}
    >
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          title={translate('auto.components.ui.sheet.1189e9fe0a', 'Close')}
          aria-label={translate('auto.components.ui.sheet.1189e9fe0a', 'Close')}
          onClick={onClose}
        >
          <X />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          title={translate('auto.components.odoo.ticket.workspace.2c5256318d', 'Open in Odoo')}
          aria-label={translate('auto.components.odoo.ticket.workspace.2c5256318d', 'Open in Odoo')}
          onClick={() => window.api.shell.openUrl(ticket.url)}
        >
          <ExternalLink />
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h2 className="truncate text-[13px] font-semibold text-foreground">{ticket.title}</h2>
        {context ? (
          <span className="truncate text-[11px] text-muted-foreground">{context}</span>
        ) : null}
      </div>
      {pager}
    </div>
  )
}
