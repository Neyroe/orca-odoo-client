import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { OdooTicket } from '../../../shared/odoo-types'
const STORAGE_KEY = 'odoo.customerRepoRoutes'
/** No practical ceiling: one row per customer is the point, and truncating a
 *  hand-written table would silently stop routing real clients. Both the parser
 *  and `upsert` trim the tail, so the rows a reload keeps are the ones a save
 *  preserved — at capacity it is the new row that is refused, not an old one. */
const MAX_ROUTES = 500
const MAX_NAME_LENGTH = 120

/** The parts of a repo that identify which host owns it. */
export type RepoHostParts = Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>

/**
 * One hand-written row of the customer-company → repo table.
 *
 * `repoId` travels with `executionHostId` because `Repo.id` is not unique in the
 * store's `repos` array: it is a cross-host union (local, SSH, runtime
 * environments), so the same id can name several repos and only the pair says
 * which one. Nothing here is git-specific — a folder workspace routes the same
 * way.
 */
export type OdooCustomerRepoRoute = {
  /** `${instanceId}:${commercialPartnerId}`; see `odooCustomerRepoRouteKey`. */
  customer: string
  /** Company name when the row was written. Label only — never matched on. */
  customerName?: string
  repoId: string
  executionHostId: string
}

/**
 * Table key for a customer company, or `null` when it cannot be keyed.
 *
 * Mirrors `odooProjectFilterValue`: the instance id qualifies the record id
 * because `res.partner` ids are per-database, and instance ids are base64url so
 * ':' cannot occur inside one.
 */
export function odooCustomerRepoRouteKey(
  instanceId: string | undefined,
  companyId: number | undefined
): string | null {
  return instanceId && typeof companyId === 'number' && Number.isSafeInteger(companyId)
    ? `${instanceId}:${companyId}`
    : null
}

/** The key a ticket routes on: its customer's company, not the contact. */
export function odooTicketCustomerRepoRouteKey(
  ticket: Pick<OdooTicket, 'instanceId' | 'customerCompany'>
): string | null {
  return odooCustomerRepoRouteKey(ticket.instanceId, ticket.customerCompany?.id)
}

/** One key's instance/company pair, or `null` if it is not a customer key. */
export function parseOdooCustomerRepoRouteKey(
  value: string
): { instanceId: string; companyId: number } | null {
  const separator = value.lastIndexOf(':')
  if (separator <= 0) {
    return null
  }
  const companyId = Number(value.slice(separator + 1))
  return Number.isSafeInteger(companyId) && companyId > 0
    ? { instanceId: value.slice(0, separator), companyId }
    : null
}

/** The stored pair for a repo the user picked. Derived, never hand-built, so the
 *  writer and `findRepoForHost` agree on what 'local' means. */
export function odooCustomerRepoRouteTarget(
  repo: RepoHostParts
): Pick<OdooCustomerRepoRoute, 'repoId' | 'executionHostId'> {
  return { repoId: repo.id, executionHostId: getRepoExecutionHostId(repo) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRoute(candidate: unknown): OdooCustomerRepoRoute | null {
  if (!isRecord(candidate) || typeof candidate.customer !== 'string') {
    return null
  }
  const customer = candidate.customer.trim()
  if (!parseOdooCustomerRepoRouteKey(customer)) {
    return null
  }
  const repoId = typeof candidate.repoId === 'string' ? candidate.repoId.trim() : ''
  // A row with no host is dropped rather than defaulted to 'local': guessing a
  // host the user never picked could create the workspace on the wrong machine.
  const executionHostId =
    typeof candidate.executionHostId === 'string' ? candidate.executionHostId.trim() : ''
  if (!repoId || !executionHostId) {
    return null
  }
  const customerName =
    typeof candidate.customerName === 'string'
      ? candidate.customerName.trim().slice(0, MAX_NAME_LENGTH)
      : ''
  return {
    customer,
    repoId,
    executionHostId,
    ...(customerName ? { customerName } : {})
  }
}

/** Tolerant of hand-edited or older payloads: unreadable rows are dropped, so a
 *  broken file routes nothing rather than routing somewhere unintended. */
export function parseOdooCustomerRepoRoutes(raw: string | null): OdooCustomerRepoRoute[] {
  if (!raw) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const seen = new Set<string>()
  const routes: OdooCustomerRepoRoute[] = []
  for (const candidate of parsed) {
    const route = parseRoute(candidate)
    if (!route || seen.has(route.customer)) {
      continue
    }
    seen.add(route.customer)
    routes.push(route)
  }
  return routes.slice(0, MAX_ROUTES)
}

/** Returns the table unchanged when `entry` is unusable (no repo, no host, or an
 *  unkeyable customer), so callers must validate before reporting a save. */
export function upsertOdooCustomerRepoRoute(
  routes: readonly OdooCustomerRepoRoute[],
  entry: OdooCustomerRepoRoute
): OdooCustomerRepoRoute[] {
  const route = parseRoute(entry)
  if (!route) {
    return [...routes]
  }
  const existingIndex = routes.findIndex((candidate) => candidate.customer === route.customer)
  if (existingIndex !== -1) {
    const next = [...routes]
    next[existingIndex] = route
    return next
  }
  return [...routes, route].slice(0, MAX_ROUTES)
}

export function removeOdooCustomerRepoRoute(
  routes: readonly OdooCustomerRepoRoute[],
  customer: string
): OdooCustomerRepoRoute[] {
  return routes.filter((route) => route.customer !== customer)
}

/** Storage access throws when it is disabled or over quota; editing the table
 *  must not break on that. */
function readStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readOdooCustomerRepoRoutes(): OdooCustomerRepoRoute[] {
  if (typeof window === 'undefined') {
    return []
  }
  return parseOdooCustomerRepoRoutes(readStorageItem(STORAGE_KEY))
}

export function writeOdooCustomerRepoRoutes(routes: readonly OdooCustomerRepoRoute[]): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routes))
  } catch {
    // Unavailable or full storage: the change stays in memory for this session.
  }
}

/**
 * Why a ticket has no target repo. Kept distinct so the caller can say what
 * happened instead of just declining:
 * - `no-customer`: the ticket carries no `partner_id` (normal — planning tasks).
 * - `company-unresolved`: it has a customer, but no company came back. Either
 *   the partner is unreadable, or a remote host predates `customerCompany`.
 * - `no-route`: the company has no row in the table yet.
 * - `repo-missing`: the row names a repo/host pair the store no longer has.
 */
export type OdooCustomerRepoTargetReason =
  | 'no-customer'
  | 'company-unresolved'
  | 'no-route'
  | 'repo-missing'

export type OdooCustomerRepoTarget<T extends RepoHostParts = Repo> =
  | { matched: true; repo: T; route: OdooCustomerRepoRoute }
  | {
      matched: false
      reason: OdooCustomerRepoTargetReason
      /** The table key that was looked up, when one could be built. */
      customer: string | null
      route: OdooCustomerRepoRoute | null
    }

/**
 * The repo a ticket's customer routes to.
 *
 * Deliberately without a default: an unmapped customer yields no target rather
 * than falling back to some repo, so nothing is ever created in the wrong one.
 */
export function resolveOdooCustomerRepoTarget<T extends RepoHostParts>(
  ticket: Pick<OdooTicket, 'instanceId' | 'customer' | 'customerCompany'>,
  routes: readonly OdooCustomerRepoRoute[],
  repos: readonly T[]
): OdooCustomerRepoTarget<T> {
  const customer = odooTicketCustomerRepoRouteKey(ticket)
  if (!customer) {
    return {
      matched: false,
      reason: ticket.customer ? 'company-unresolved' : 'no-customer',
      customer: null,
      route: null
    }
  }
  const route = routes.find((candidate) => candidate.customer === customer) ?? null
  if (!route) {
    return { matched: false, reason: 'no-route', customer, route: null }
  }
  // Explicit hostId: the row names its own host, so this must not fall back to
  // the focused-host guess a bare id would need.
  const repo = findRepoForHost(repos, route.repoId, { hostId: route.executionHostId })
  if (!repo) {
    return { matched: false, reason: 'repo-missing', customer, route }
  }
  return { matched: true, repo, route }
}
