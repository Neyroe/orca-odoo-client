/**
 * Pacing for the unattended workspace start.
 *
 * Its own interval, deliberately faster than the ticket panel's four hours: this
 * runs whether or not the panel is on screen, and "automatically" has to mean
 * sooner than "the next time you open the Odoo tab". Still slow enough that one
 * `search_read` every quarter hour is nothing next to a manual refresh, which
 * matters on SSH where every read shares the relay with the rest of Orca.
 */
export const ODOO_AUTO_WORKSPACE_INTERVAL_MS = 15 * 60 * 1000

/**
 * Whether this tick may talk to Odoo.
 *
 * `lastRunAt` is the part a bare interval does not give: the visibility wrapper
 * fires an immediate run every time the window becomes visible, so a user
 * switching windows would otherwise read Odoo on every return.
 */
export function shouldRunOdooAutoWorkspace(args: {
  enabled: boolean
  connected: boolean
  windowVisible: boolean
  /** A pass is already in flight; a second one would race its own handled set. */
  running: boolean
  /** When the previous pass started, or null when none has. */
  lastRunAt: number | null
  now: number
}): boolean {
  if (!args.enabled || !args.connected || !args.windowVisible || args.running) {
    return false
  }
  return args.lastRunAt === null || args.now - args.lastRunAt >= ODOO_AUTO_WORKSPACE_INTERVAL_MS
}
