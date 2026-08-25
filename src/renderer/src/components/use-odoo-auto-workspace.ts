import { useEffect, useRef } from 'react'

import {
  runOdooAutoWorkspacePass,
  type OdooAutoWorkspaceSession
} from '@/components/odoo-auto-workspace-run'
import {
  ODOO_AUTO_WORKSPACE_INTERVAL_MS,
  shouldRunOdooAutoWorkspace
} from '@/components/odoo-auto-workspace-schedule'
import { readOdooAutoWorkspaceSettings } from '@/components/odoo-auto-workspace-settings'
import { installWindowVisibilityInterval, isWindowVisible } from '@/lib/window-visibility-interval'
import { useAppStore } from '@/store'

/**
 * Starts a workspace for tickets matching the armed saved filter, without asking.
 *
 * Mounted at the app root rather than in the Odoo panel: tied to the panel,
 * "automatically" meant "the next time you happen to have that tab open". It
 * keeps its own read and its own interval, and still stands down while the window
 * is hidden — there is nobody to hand a workspace to.
 */
export function useOdooAutoWorkspace(): void {
  const connected = useAppStore((s) => s.odooStatus.connected)
  const odooStatusChecked = useAppStore((s) => s.odooStatusChecked)
  const checkOdooConnection = useAppStore((s) => s.checkOdooConnection)
  const session = useRef<OdooAutoWorkspaceSession>({ handled: new Set(), reported: new Set() })
  const runningRef = useRef(false)
  const lastRunAtRef = useRef<number | null>(null)

  // Nothing else probes Odoo unless the panel or Settings is open, so an armed
  // rule would otherwise wait behind a `connected` that stays false all session.
  useEffect(() => {
    if (odooStatusChecked || !readOdooAutoWorkspaceSettings().enabled) {
      return
    }
    void checkOdooConnection()
  }, [odooStatusChecked, checkOdooConnection])

  useEffect(() => {
    if (!connected) {
      return
    }
    const run = (): void => {
      const settings = readOdooAutoWorkspaceSettings()
      if (
        !shouldRunOdooAutoWorkspace({
          enabled: settings.enabled,
          connected: useAppStore.getState().odooStatus.connected,
          windowVisible: isWindowVisible(),
          running: runningRef.current,
          lastRunAt: lastRunAtRef.current,
          now: Date.now()
        })
      ) {
        return
      }
      // Stamped at entry, not completion: a slow pass must not let the next tick
      // straight through behind it.
      lastRunAtRef.current = Date.now()
      runningRef.current = true
      void runOdooAutoWorkspacePass(settings, session.current).finally(() => {
        runningRef.current = false
      })
    }
    // Keyed on `connected` so the first pass fires when the connection lands
    // rather than waiting out a full interval from a cold, disconnected start.
    return installWindowVisibilityInterval({ run, intervalMs: ODOO_AUTO_WORKSPACE_INTERVAL_MS })
  }, [connected])
}
