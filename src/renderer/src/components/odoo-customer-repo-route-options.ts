import { getRepoHostIdentity } from '@/store/slices/repo-host-identity'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'

export type OdooRepoRouteOption = { value: string; label: string; repo: Repo }

/**
 * One option per repo the routing table can name.
 *
 * Keyed on the host-qualified identity rather than `Repo.id`: `repos` is a
 * cross-host union, so the same id can name several repos and a bare-id option
 * would silently pick whichever came first. The host is folded into the label
 * only when a name is otherwise ambiguous — see `odooProjectFilterOptions`, which
 * does the same with instance names.
 */
export function odooRepoRouteOptions(repos: readonly Repo[]): OdooRepoRouteOption[] {
  const nameCounts = new Map<string, number>()
  for (const repo of repos) {
    nameCounts.set(repo.displayName, (nameCounts.get(repo.displayName) ?? 0) + 1)
  }
  return repos
    .map((repo) => ({
      value: getRepoHostIdentity(repo),
      label:
        (nameCounts.get(repo.displayName) ?? 0) > 1
          ? `${repo.displayName} (${getRepoExecutionHostId(repo)})`
          : repo.displayName,
      repo
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function findOdooRepoRouteOption(
  options: readonly OdooRepoRouteOption[],
  route: { repoId: string; executionHostId: string }
): OdooRepoRouteOption | null {
  return (
    options.find(
      (option) =>
        option.repo.id === route.repoId &&
        getRepoExecutionHostId(option.repo) === route.executionHostId
    ) ?? null
  )
}
