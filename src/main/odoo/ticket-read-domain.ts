// The Odoo domains a ticket read is assembled from. Split out of tickets.ts so
// the preset, project and instance narrowing rules read as one unit — and so
// they can be asserted without standing up a client.
import { ODOO_CLOSED_STATES } from '../../shared/odoo-types'
import type { OdooProjectScope, OdooTicketFilter } from '../../shared/odoo-types'

export type OdooDomain = unknown[]

// Why: mirrors the domain on Odoo's own My/All Tasks actions, which hide
// template tasks. Without it Orca would list tickets the Odoo UI never shows.
export const BASE_DOMAIN: OdooDomain = [
  ['has_template_ancestor', '=', false],
  ['has_project_template', '=', false]
]

const OPEN_STATE_DOMAIN: OdooDomain = [['state', 'not in', [...ODOO_CLOSED_STATES]]]

export function filterDomain(filter: OdooTicketFilter, uid: number): OdooDomain {
  if (filter === 'done') {
    return [...BASE_DOMAIN, ['state', 'in', [...ODOO_CLOSED_STATES]]]
  }
  if (filter === 'assigned') {
    return [...BASE_DOMAIN, ...OPEN_STATE_DOMAIN, ['user_ids', 'in', [uid]]]
  }
  if (filter === 'reported') {
    return [...BASE_DOMAIN, ...OPEN_STATE_DOMAIN, ['create_uid', '=', uid]]
  }
  return [...BASE_DOMAIN, ...OPEN_STATE_DOMAIN]
}

/**
 * The scope's contribution to the domain of the instance `instanceId`, or `null`
 * when that instance holds nothing the scope can match.
 *
 * `null` is not an empty domain: a `project.project` id belongs to exactly one
 * database, so an instance with nothing selected is *out of scope* rather than
 * narrowed. Callers answer empty for it instead of running the read.
 *
 * No branch ever emits `['project_id', 'in', []]` — an empty `in` matches nothing,
 * so AND-ing one in would silently zero a result that should have been skipped or
 * scoped to the no-project leaf instead.
 */
export function projectScopeDomain(
  scope: OdooProjectScope | null | undefined,
  instanceId: string
): OdooDomain | null {
  if (!scope) {
    return []
  }
  const projectIds =
    scope.projectsByInstance.find((entry) => entry.instanceId === instanceId)?.projectIds ?? []
  const noProjectLeaf = ['project_id', '=', false]
  if (projectIds.length === 0) {
    return scope.includeNoProject ? [noProjectLeaf] : null
  }
  const projectLeaf = ['project_id', 'in', projectIds]
  // Odoo domains take prefix operators: ['|', a, b] is OR(a, b), and it composes
  // with the surrounding implicit AND.
  return scope.includeNoProject ? ['|', projectLeaf, noProjectLeaf] : [projectLeaf]
}
