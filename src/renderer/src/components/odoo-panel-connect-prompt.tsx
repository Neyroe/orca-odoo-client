import React, { useState } from 'react'

import { OdooIcon } from '@/components/icons/OdooIcon'
import { OdooConnectDialog } from '@/components/odoo-connect-dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

/** The Odoo tab's empty state until an instance is connected. */
export function OdooPanelConnectPrompt({ onHide }: { onHide?: () => void }): React.JSX.Element {
  const [connectOpen, setConnectOpen] = useState(false)

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
