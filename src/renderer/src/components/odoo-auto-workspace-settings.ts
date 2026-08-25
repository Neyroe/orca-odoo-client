const STORAGE_KEY = 'odoo.autoWorkspace'
/** Hard ceiling regardless of what is stored: a bad filter must not be able to
 *  spawn an unbounded number of worktrees on one pass. */
export const ODOO_AUTO_WORKSPACE_MAX_PER_RUN = 5

export type OdooAutoWorkspaceSettings = {
  enabled: boolean
  /**
   * The saved ticket filter that arms this, by id.
   *
   * A pointer rather than a copy: editing the filter has to change what is
   * armed, and the id is also what makes the auto-create's own read the same
   * question the kanban asks — the panel's page is not the candidate set.
   */
  savedFilterId: string | null
  maxPerRun: number
}

export const DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS: OdooAutoWorkspaceSettings = {
  enabled: false,
  savedFilterId: null,
  maxPerRun: 3
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Tolerant of hand-edited or older payloads: anything unreadable falls back to
 *  the disabled default rather than to a state that could create workspaces. */
export function parseOdooAutoWorkspaceSettings(raw: string | null): OdooAutoWorkspaceSettings {
  if (!raw) {
    return DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS
  }
  if (!isRecord(parsed)) {
    return DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS
  }
  // A whitespace-only id is no filter at all, so normalise it away before the
  // `enabled` gate below reads it.
  const savedFilterId =
    typeof parsed.savedFilterId === 'string' ? parsed.savedFilterId.trim() || null : null
  const maxPerRun = Number.isSafeInteger(parsed.maxPerRun)
    ? (parsed.maxPerRun as number)
    : DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS.maxPerRun
  return {
    // Why: no filter means no candidate set, so treat it as off rather than
    // letting a half-configured payload look armed.
    enabled: parsed.enabled === true && savedFilterId !== null,
    savedFilterId,
    maxPerRun: Math.min(Math.max(maxPerRun, 0), ODOO_AUTO_WORKSPACE_MAX_PER_RUN)
  }
}

export function readOdooAutoWorkspaceSettings(): OdooAutoWorkspaceSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS
  }
  try {
    return parseOdooAutoWorkspaceSettings(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS
  }
}

export function writeOdooAutoWorkspaceSettings(settings: OdooAutoWorkspaceSettings): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Unavailable or full storage: the change stays in memory for this session.
  }
}
