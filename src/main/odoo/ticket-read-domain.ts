// How a ticket read's domain is assembled: what every read excludes, what the
// project scope contributes per instance, and the composition that holds the
// fragments apart. Split out of tickets.ts so these rules can be asserted
// without standing up a client.
//
// Main-only on purpose. The preset compiler is shared instead — the renderer
// migrates seeded presets to stored domains, so it needs the same equivalences.
import { andGroupedDomain } from '../../shared/odoo-domain-validation'
import type { OdooDomain, OdooProjectScope } from '../../shared/odoo-types'

// Why: mirrors the domain on Odoo's own My/All Tasks actions, which hide
// template tasks. Without it Orca would list tickets the Odoo UI never shows.
export const BASE_DOMAIN: OdooDomain = [
  ['has_template_ancestor', '=', false],
  ['has_project_template', '=', false]
]

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

/**
 * AND-composes domain fragments, each closed in its own group.
 *
 * Why grouping and not a flat spread: a fragment whose prefix operators are not
 * balanced within itself reaches past its own end and consumes the next
 * fragment's leaves — the project scope, or one of BASE_DOMAIN's template
 * exclusions. Grouping makes that structurally impossible whatever order the
 * fragments are given in, and `andGroupedDomain` throws rather than pass an
 * unbalanced fragment through ungrouped.
 */
export function composeDomain(...parts: OdooDomain[]): OdooDomain {
  return parts.filter((part) => part.length > 0).flatMap((part) => andGroupedDomain(part))
}
