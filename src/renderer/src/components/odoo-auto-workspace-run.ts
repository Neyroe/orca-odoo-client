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

/**
 * Loads the worktree catalog for every mapped repo before candidates are picked.
 *
 * Closing a race, not an optimisation: the pass fires when the Odoo connection
 * lands, which does not wait for `fetchWorktrees`. Against an empty catalog every
 * ticket that already has a workspace reads as unlinked — `session.handled` is
 * empty too on a fresh start, by design — so the pass starts a second workspace
 * for work already under way, and does it again on every launch that loses the
 * race.
 *
 * Per mapped repo rather than per ticket: one refresh answers for every ticket
 * that routes there, and a failure leaves the catalog as it was, which the
 * `linkedOdooTicket` filter then reads as "nothing known" — the same conservative
 * answer as before, never a wrong one.
 */
async function refreshRoutedWorktrees(): Promise<void> {
  const fetchWorktrees = useAppStore.getState().fetchWorktrees
  const repoIds = [...new Set(readOdooCustomerRepoRoutes().map((route) => route.repoId))]
  await Promise.all(repoIds.map((repoId) => fetchWorktrees(repoId).catch(() => undefined)))
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
 * Whether Orca can name a base for this repo at all.
 *
 * Which base is left to `resolveWorktreeCreateBase` main-side, which prefers the
 * repo's `worktreeBaseRef` over the git default: the base ref set in the repo's
 * settings has to govern an unattended start exactly as it governs a manual one,
 * or the two silently disagree in the same repo — a repo whose real base is
 * `develop` would keep starting work from `main` with nothing on screen to say so.
 *
 * Probing at all only separates "this repo has no base" from a create failure, so
 * such a ticket is reported as skipped rather than as an error. A configured
 * override is itself an answer, so it needs no probe.
 */
async function hasResolvableBase(target: RoutedTicket['target']): Promise<boolean> {
  if (target.repo.worktreeBaseRef?.trim()) {
    return true
  }
  try {
    const result = await getRuntimeRepoBaseRefDefault(
      target.ownerSettings,
      target.repo.id,
      target.hostId
    )
    return result.defaultBaseRef !== null
  } catch {
    return false
  }
}

async function startWorkspace(
  candidate: RoutedTicket,
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
      // Empty on purpose: `resolveWorktreeCreateBase` then prefers the repo's own
      // `worktreeBaseRef` over the git default, so the base ref configured for the
      // repo governs this start exactly as it governs a manual one.
      '',
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
  await refreshRoutedWorktrees()
  const skips: OdooAutoWorkspaceSkip[] = []
  const { selected, droppedByCap } = capOdooAutoWorkspaceRun(
    routeCandidates(tickets, session, skips),
    settings.maxPerRun
  )
  if (droppedByCap > 0) {
    noticeCapped(droppedByCap)
  }
  // One probe per distinct repo: several tickets of one customer share an answer.
  const hasBase = new Map<string, boolean>()
  for (const candidate of selected) {
    const key = `${candidate.target.hostId}::${candidate.target.repo.id}`
    if (!hasBase.has(key)) {
      hasBase.set(key, await hasResolvableBase(candidate.target))
    }
    if (!hasBase.get(key)) {
      skips.push({
        ticketId: candidate.ticket.id,
        ref: candidate.ticket.ref,
        reason: 'no-base-ref'
      })
      continue
    }
    await startWorkspace(candidate, session, skips)
  }
  reportSkips(session, skips)
}
