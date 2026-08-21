import { resolveDashboardCardOdooTicket } from '@/components/dashboard/dashboard-card-context'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { Worktree } from '../../../../shared/worktree/types'

export type WorkspaceLinkedOdooTicket = {
  id: number
  instanceId: string | null
  /** Human-facing identifier, e.g. `#4` — the stored fallback when no read lands. */
  ref: string
  title: string | null
  url: string | null
  /** The source identity the link was made through; reads must go through it. */
  sourceContext: TaskSourceContext | null
}

/**
 * The Odoo ticket a workspace links to, from the workspace alone — no read.
 *
 * Folder workspaces carry the link only as `linkedWorkItem` (the flat
 * `linkedOdooTicket` field is worktree-only), which the shared resolver already
 * accounts for, so both workspace kinds resolve here.
 */
export function getWorkspaceLinkedOdooTicket(worktree: Worktree): WorkspaceLinkedOdooTicket | null {
  const linked = resolveDashboardCardOdooTicket(worktree)
  if (!linked) {
    return null
  }
  const sourceContext =
    worktree.linkedTaskSourceContext?.provider === 'odoo' ? worktree.linkedTaskSourceContext : null
  return {
    id: linked.id,
    instanceId: linked.instanceId ?? null,
    ref: `#${linked.id}`,
    title: linked.title ?? null,
    url: linked.url ?? null,
    sourceContext
  }
}
