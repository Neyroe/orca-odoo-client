import { translate } from '@/i18n/i18n'
import type { OdooCustomerRepoTargetReason } from '@/components/odoo-customer-repo-routes'

/**
 * Why one ticket earned no workspace this pass.
 *
 * The four routing reasons come from `resolveOdooCustomerRepoTarget` and stay
 * distinct on purpose: "this ticket has no client" and "this client is not in my
 * table" are different problems with different fixes, and one generic "could not
 * create" would hide which. The three added here are Orca-side refusals with the
 * same property.
 */
export type OdooAutoWorkspaceSkipReason =
  | OdooCustomerRepoTargetReason
  /** The route names a repo id several hosts share, and create takes no host. */
  | 'repo-ambiguous'
  /** No primary branch resolved, and the base ref is never guessed. */
  | 'no-base-ref'
  /** The ticket's Odoo instance is not among the connected ones. */
  | 'source-unresolved'

export type OdooAutoWorkspaceSkip = {
  ticketId: number
  ref: string
  reason: OdooAutoWorkspaceSkipReason
}

/** One line the user sees, standing for every ticket that failed the same way. */
export type OdooAutoWorkspaceSkipNotice = {
  reason: OdooAutoWorkspaceSkipReason
  count: number
  refs: string[]
}

/** Refs listed in a notice before it trails off; the count carries the rest. */
const MAX_LISTED_REFS = 5

/** Session identity of one skip. Reason-qualified so a ticket that stops being
 *  unrouted and starts being unbuildable is reported again, once. */
export function odooAutoWorkspaceSkipKey(skip: OdooAutoWorkspaceSkip): string {
  return `${skip.ticketId}:${skip.reason}`
}

/**
 * One notice per reason, and only for tickets not already reported that way.
 *
 * Grouped rather than one toast per ticket, and remembered rather than repeated:
 * this runs unattended every quarter hour, so a table missing five customers
 * would otherwise stack five toasts forever. `reported` is session state — a
 * restart says it again, which is the right side to err on.
 */
export function groupOdooAutoWorkspaceSkips(
  skips: readonly OdooAutoWorkspaceSkip[],
  reported: ReadonlySet<string>
): { notices: OdooAutoWorkspaceSkipNotice[]; keys: string[] } {
  const byReason = new Map<OdooAutoWorkspaceSkipReason, OdooAutoWorkspaceSkipNotice>()
  const keys: string[] = []
  const seen = new Set<string>()
  for (const skip of skips) {
    const key = odooAutoWorkspaceSkipKey(skip)
    if (reported.has(key) || seen.has(key)) {
      continue
    }
    seen.add(key)
    keys.push(key)
    const notice = byReason.get(skip.reason)
    if (notice) {
      notice.count += 1
      if (notice.refs.length < MAX_LISTED_REFS) {
        notice.refs.push(skip.ref)
      }
      continue
    }
    byReason.set(skip.reason, { reason: skip.reason, count: 1, refs: [skip.ref] })
  }
  return { notices: [...byReason.values()], keys }
}

function skipReasonMessage(reason: OdooAutoWorkspaceSkipReason): string {
  switch (reason) {
    case 'no-customer':
      return translate(
        'auto.components.odoo.auto.workspace.skip.no_customer',
        'Auto-start skipped tickets with no customer.'
      )
    case 'company-unresolved':
      return translate(
        'auto.components.odoo.auto.workspace.skip.company_unresolved',
        "Auto-start could not read the customer's company on some tickets."
      )
    case 'no-route':
      return translate(
        'auto.components.odoo.auto.workspace.skip.no_route',
        'Auto-start has no repository mapped for these customers.'
      )
    case 'repo-missing':
      return translate(
        'auto.components.odoo.auto.workspace.skip.repo_missing',
        'Auto-start maps these customers to a repository Orca no longer has.'
      )
    case 'repo-ambiguous':
      return translate(
        'auto.components.odoo.auto.workspace.skip.repo_ambiguous',
        'Auto-start cannot tell which host owns the mapped repository.'
      )
    case 'no-base-ref':
      return translate(
        'auto.components.odoo.auto.workspace.skip.no_base_ref',
        'Auto-start found no base branch in the mapped repository.'
      )
    case 'source-unresolved':
      return translate(
        'auto.components.odoo.auto.workspace.skip.source_unresolved',
        'Auto-start could not resolve the Odoo instance these tickets belong to.'
      )
  }
}

/** Toast copy for one notice: what went wrong, then which tickets it hit. */
export function describeOdooAutoWorkspaceSkip(notice: OdooAutoWorkspaceSkipNotice): {
  message: string
  description: string
} {
  const listed = notice.refs.join(', ')
  return {
    message: skipReasonMessage(notice.reason),
    description:
      notice.count > notice.refs.length
        ? translate(
            'auto.components.odoo.auto.workspace.skip.refs_more',
            '{{value0}} and {{count}} more.',
            { value0: listed, count: notice.count - notice.refs.length }
          )
        : listed
  }
}

/**
 * Why a whole pass produced nothing, as opposed to why one ticket did.
 *
 * Session-deduplicated like the skips, and for the same reason: a filter the
 * user renamed would otherwise announce itself every quarter hour until Orca is
 * restarted.
 */
export type OdooAutoWorkspaceRunFault = 'filter-missing' | 'domain-invalid' | 'read-failed'

function runFaultMessage(fault: OdooAutoWorkspaceRunFault): string {
  switch (fault) {
    case 'filter-missing':
      return translate(
        'auto.components.odoo.auto.workspace.fault.filter_missing',
        'Auto-start points at a saved filter that no longer exists.'
      )
    case 'domain-invalid':
      return translate(
        'auto.components.odoo.auto.workspace.fault.domain_invalid',
        'Auto-start could not turn its saved filter into an Odoo domain.'
      )
    case 'read-failed':
      return translate(
        'auto.components.odoo.auto.workspace.fault.read_failed',
        'Auto-start could not read tickets from Odoo.'
      )
  }
}

/** Toast copy plus the session key that keeps it to once per distinct cause. */
export function describeOdooAutoWorkspaceRunFault(
  fault: OdooAutoWorkspaceRunFault,
  detail: string
): { key: string; message: string; description: string } {
  return { key: `run:${fault}:${detail}`, message: runFaultMessage(fault), description: detail }
}
