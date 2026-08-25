import { toast } from 'sonner'

import {
  capOdooAutoWorkspaceRun,
  selectOdooAutoWorkspaceCandidates
} from '@/components/odoo-auto-workspace-candidates'
import {
  resolveOdooAutoWorkspaceRepoTarget,
  type OdooAutoWorkspaceRepoTarget
} from '@/components/odoo-auto-workspace-repo-target'
import {
  describeOdooAutoWorkspaceRunFault,
  describeOdooAutoWorkspaceSkip,
  groupOdooAutoWorkspaceSkips,
  type OdooAutoWorkspaceRunFault,
  type OdooAutoWorkspaceSkip
} from '@/components/odoo-auto-workspace-skip-report'
import { readOdooCustomerRepoRoutes } from '@/components/odoo-customer-repo-routes'
import { parseOdooProjectFilters } from '@/components/odoo-ticket-facets'
import { compileOdooTicketFilterDomain } from '@/components/odoo-ticket-filter-domain'
import { readSavedOdooTicketFilters } from '@/components/odoo-saved-ticket-filters'
import { getOdooTicketWorkspaceSeed } from '@/components/odoo-ticket-workspace-seed'
import { bindTaskPageOdooItemSourceContext } from '@/components/task-page-odoo-item-source-context'
import { getRuntimeRepoBaseRefDefault } from '@/runtime/runtime-repo-client'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { OdooAutoWorkspaceSettings } from '@/components/odoo-auto-workspace-settings'
import type { OdooTicket } from '../../../shared/odoo-types'
import type { WorkspaceLinkedItem } from '../../../shared/worktree/types'

/**
 * How wide this pass's own read goes.
 *
 * Well past the panel's page because the closed-state guard filters after the
 * read: a filter returning mostly finished work would otherwise push its open
 * tickets off the page, reintroducing the off-page blindness a dedicated read
 * exists to remove. Still bounded — nobody is watching this one.
 */
export const ODOO_AUTO_WORKSPACE_READ_LIMIT = 200

export type OdooAutoWorkspaceSession = {
  /**
   * Tickets a create was launched for. Covers the window between "create
   * started" and "worktree visible in the store", where the ticket still looks
   * unlinked. Session-scoped, so deleting a workspace re-arms its ticket on the
   * next Orca start.
   */
  handled: Set<number>
  /** Skip and fault keys already toasted, so an unattended pass stays quiet. */
  reported: Set<string>
}

type RoutedTicket = {
  ticket: OdooTicket
  target: Extract<OdooAutoWorkspaceRepoTarget, { ok: true }>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function reportFault(
  session: OdooAutoWorkspaceSession,
  fault: OdooAutoWorkspaceRunFault,
  detail: string
): void {
  const notice = describeOdooAutoWorkspaceRunFault(fault, detail)
  if (session.reported.has(notice.key)) {
    return
  }
  session.reported.add(notice.key)
  toast.warning(notice.message, { description: notice.description || undefined })
}

function reportSkips(
  session: OdooAutoWorkspaceSession,
  skips: readonly OdooAutoWorkspaceSkip[]
): void {
  const { notices, keys } = groupOdooAutoWorkspaceSkips(skips, session.reported)
  for (const key of keys) {
    session.reported.add(key)
  }
  for (const notice of notices) {
    const copy = describeOdooAutoWorkspaceSkip(notice)
    toast.warning(copy.message, { description: copy.description })
  }
}

function noticeCapped(droppedByCap: number): void {
  // Never drop silently: a pass that quietly ignored matches would read as "the
  // filter is wrong" rather than "the cap held".
  toast.warning(
    droppedByCap === 1
      ? translate(
          'auto.components.odoo.auto.workspace.capped_one',
          '{{count}} more matching ticket was skipped by the per-run limit.',
          { count: droppedByCap }
        )
      : translate(
          'auto.components.odoo.auto.workspace.capped_other',
          '{{count}} more matching tickets were skipped by the per-run limit.',
          { count: droppedByCap }
        )
  )
}

/** Eligible tickets paired with the repo their customer routes to; everything
 *  refused lands in `skips` with the reason that refused it. */
function routeCandidates(
  tickets: readonly OdooTicket[],
  session: OdooAutoWorkspaceSession,
  skips: OdooAutoWorkspaceSkip[]
): RoutedTicket[] {
  const state = useAppStore.getState()
  const excluded = new Set(session.handled)
  for (const worktree of state.allWorktrees()) {
    if (worktree.linkedOdooTicket) {
      excluded.add(worktree.linkedOdooTicket)
    }
  }
  const routes = readOdooCustomerRepoRoutes()
  const routed: RoutedTicket[] = []
  for (const ticket of selectOdooAutoWorkspaceCandidates(tickets, {
    excludedTicketIds: excluded
  })) {
    const target = resolveOdooAutoWorkspaceRepoTarget({
      ticket,
      routes,
      repos: state.repos,
      settings: state.settings
    })
    if (!target.ok) {
      skips.push({ ticketId: ticket.id, ref: ticket.ref, reason: target.reason })
      continue
    }
    routed.push({ ticket, target })
  }
  return routed
}

/**
 * The repo's primary branch, passed explicitly so it wins over a per-repo
 * `worktreeBaseRef` override — the user wants the primary always, and an empty
 * request would let `resolveWorktreeCreateBase` prefer the override instead.
 *
 * A failed probe reads as null like an absent default: either way Orca does not
 * know the primary, and guessing one is what this refuses to do.
 */
async function resolveBaseRef(target: RoutedTicket['target']): Promise<string | null> {
  try {
    const result = await getRuntimeRepoBaseRefDefault(
      target.ownerSettings,
      target.repo.id,
      target.hostId
    )
    return result.defaultBaseRef
  } catch {
    return null
  }
}

async function startWorkspace(
  candidate: RoutedTicket,
  baseRef: string,
  session: OdooAutoWorkspaceSession,
  skips: OdooAutoWorkspaceSkip[]
): Promise<void> {
  const { ticket, target } = candidate
  const state = useAppStore.getState()
  const taskSourceContext = bindTaskPageOdooItemSourceContext({
    ticket,
    instances: state.odooStatus.instances ?? [],
    settings: state.settings ?? { activeRuntimeEnvironmentId: null }
  })
  if (!taskSourceContext) {
    skips.push({ ticketId: ticket.id, ref: ticket.ref, reason: 'source-unresolved' })
    return
  }
  session.handled.add(ticket.id)
  const linkedWorkItem: WorkspaceLinkedItem = {
    provider: 'odoo',
    type: 'issue',
    number: ticket.id,
    title: `${ticket.ref} ${ticket.title}`,
    url: ticket.url,
    odooInstanceId:
      taskSourceContext.providerIdentity?.provider === 'odoo'
        ? (taskSourceContext.providerIdentity.instanceId ?? undefined)
        : undefined
  }
  try {
    await state.createWorktree(
      target.repo.id,
      getOdooTicketWorkspaceSeed(ticket),
      baseRef,
      'inherit',
      undefined,
      'sidebar',
      `${ticket.ref} ${ticket.title}`,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { linkedWorkItem, linkedTaskSourceContext: taskSourceContext }
    )
    toast.success(
      translate(
        'auto.components.odoo.auto.workspace.created',
        'Started a workspace for {{value0}}.',
        { value0: ticket.ref }
      )
    )
  } catch (error) {
    // Keep the ticket in handled: retrying every pass would hammer a repo that
    // is failing for a structural reason.
    toast.error(
      translate(
        'auto.components.odoo.auto.workspace.failed',
        'Could not start a workspace for {{value0}}.',
        { value0: ticket.ref }
      ),
      { description: errorMessage(error) }
    )
  }
}

/**
 * One unattended pass: resolve the armed saved filter, read Odoo for it, and
 * start a workspace for every ticket that routes to a repo.
 *
 * The read is this pass's own — the panel's page is filtered by its search, its
 * scope and its 50 rows, so a ticket outside it would never have triggered.
 */
export async function runOdooAutoWorkspacePass(
  settings: OdooAutoWorkspaceSettings,
  session: OdooAutoWorkspaceSession
): Promise<void> {
  const store = useAppStore.getState()
  const saved = readSavedOdooTicketFilters().find((entry) => entry.id === settings.savedFilterId)
  if (!saved) {
    reportFault(session, 'filter-missing', settings.savedFilterId ?? '')
    return
  }
  const compiled = compileOdooTicketFilterDomain({
    filters: saved.filters,
    viewerUid: store.odooStatus.viewer?.uid,
    rawDomain: saved.rawDomain ?? null
  })
  if (!compiled.ok) {
    reportFault(session, 'domain-invalid', compiled.error)
    return
  }
  let tickets: OdooTicket[]
  try {
    tickets = await store.searchOdooTickets(compiled.domain, ODOO_AUTO_WORKSPACE_READ_LIMIT, {
      // The project facet never compiles into the domain; it travels as scope.
      projectScope: parseOdooProjectFilters(saved.filters.projects)
    })
  } catch (error) {
    reportFault(session, 'read-failed', errorMessage(error))
    return
  }
  const skips: OdooAutoWorkspaceSkip[] = []
  const { selected, droppedByCap } = capOdooAutoWorkspaceRun(
    routeCandidates(tickets, session, skips),
    settings.maxPerRun
  )
  if (droppedByCap > 0) {
    noticeCapped(droppedByCap)
  }
  // One probe per distinct repo: several tickets of one customer share an answer.
  const baseRefs = new Map<string, string | null>()
  for (const candidate of selected) {
    const key = `${candidate.target.hostId}::${candidate.target.repo.id}`
    if (!baseRefs.has(key)) {
      baseRefs.set(key, await resolveBaseRef(candidate.target))
    }
    const baseRef = baseRefs.get(key) ?? null
    if (!baseRef) {
      skips.push({
        ticketId: candidate.ticket.id,
        ref: candidate.ticket.ref,
        reason: 'no-base-ref'
      })
      continue
    }
    await startWorkspace(candidate, baseRef, session, skips)
  }
  reportSkips(session, skips)
}
