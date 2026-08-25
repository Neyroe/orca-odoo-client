import { findRepoForHost } from '@/store/slices/repo-host-identity'
import {
  resolveOdooCustomerRepoTarget,
  type OdooCustomerRepoRoute
} from '@/components/odoo-customer-repo-routes'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { OdooTicket } from '../../../shared/odoo-types'
import type { Repo } from '../../../shared/repo-types'
import type { OdooAutoWorkspaceSkipReason } from '@/components/odoo-auto-workspace-skip-report'

type OwnerSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null

export type OdooAutoWorkspaceRepoTarget =
  | {
      ok: true
      repo: Repo
      hostId: ExecutionHostId
      route: OdooCustomerRepoRoute
      /** Which runtime answers for this repo; see the note on the function. */
      ownerSettings: OwnerSettings
    }
  | { ok: false; reason: OdooAutoWorkspaceSkipReason }

/**
 * The settings a repo's owning host answers to.
 *
 * Replicates the store's private `settingsForKnownRepoOwner`: an SSH or local
 * repo is served by the desktop client even while a runtime environment is
 * focused, and a runtime repo is served by its own environment even when it is
 * not. Passing the raw global settings instead would send the base-ref probe to
 * the wrong side and answer null for every cross-host route.
 */
export function odooAutoWorkspaceRepoOwnerSettings(
  settings: OwnerSettings,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'>
): OwnerSettings {
  // A repo claiming neither host nor connection belongs to whatever runtime is
  // focused, so its settings pass through untouched — nulling the environment
  // here would probe the base ref locally for a create that goes over RPC.
  if (!repo.executionHostId && !repo.connectionId) {
    return settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (parsed?.kind === 'runtime') {
    return { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
  }
  if (parsed?.kind === 'local' && settings?.activeRuntimeEnvironmentId) {
    return { ...settings, activeRuntimeEnvironmentId: null }
  }
  if (parsed?.kind !== 'ssh') {
    return settings
  }
  return { ...settings, activeRuntimeEnvironmentId: null }
}

/**
 * The repo a ticket's customer routes to, refused whenever `createWorktree`
 * could not be told to use it.
 *
 * `createWorktree` takes a bare repo id and re-derives the host itself, but
 * `Repo.id` is not unique across hosts — the route carries the host precisely
 * because of that. So the route's target only counts when a bare-id lookup lands
 * on the same repo; anything else is refused as `repo-ambiguous` rather than
 * created on whichever host the focus happened to pick.
 */
export function resolveOdooAutoWorkspaceRepoTarget(args: {
  ticket: Pick<OdooTicket, 'instanceId' | 'customer' | 'customerCompany'>
  routes: readonly OdooCustomerRepoRoute[]
  repos: readonly Repo[]
  settings: OwnerSettings
}): OdooAutoWorkspaceRepoTarget {
  const target = resolveOdooCustomerRepoTarget(args.ticket, args.routes, args.repos)
  if (!target.matched) {
    return { ok: false, reason: target.reason }
  }
  const hostId = getRepoExecutionHostId(target.repo)
  const bareIdOwner = findRepoForHost(args.repos, target.route.repoId, {
    settings: args.settings
  })
  if (!bareIdOwner || getRepoExecutionHostId(bareIdOwner) !== hostId) {
    return { ok: false, reason: 'repo-ambiguous' }
  }
  return {
    ok: true,
    repo: target.repo,
    hostId,
    route: target.route,
    ownerSettings: odooAutoWorkspaceRepoOwnerSettings(args.settings, target.repo)
  }
}
