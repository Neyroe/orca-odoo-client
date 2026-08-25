import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  odooCustomerRepoRouteKey,
  odooCustomerRepoRouteTarget,
  odooTicketCustomerRepoRouteKey,
  parseOdooCustomerRepoRouteKey,
  parseOdooCustomerRepoRoutes,
  readOdooCustomerRepoRoutes,
  removeOdooCustomerRepoRoute,
  resolveOdooCustomerRepoTarget,
  upsertOdooCustomerRepoRoute,
  writeOdooCustomerRepoRoutes,
  type OdooCustomerRepoRoute,
  type RepoHostParts
} from './odoo-customer-repo-routes'
import type { OdooTicket } from '../../../shared/odoo-types'

// A base64url instance id, as Orca mints them: ':' cannot occur inside one.
const INSTANCE = 'aHR0cHM6Ly9hbHBoYQ'
const NOVACEL = `${INSTANCE}:1633`

function route(overrides: Partial<OdooCustomerRepoRoute> = {}): OdooCustomerRepoRoute {
  return { customer: NOVACEL, repoId: 'repo-1', executionHostId: 'local', ...overrides }
}

function ticket(overrides: Partial<OdooTicket> = {}): OdooTicket {
  return {
    id: 1,
    ref: '#1',
    instanceId: INSTANCE,
    title: 'Task',
    url: 'https://alpha.odoo.com/odoo/all-tasks/1',
    state: '01_in_progress',
    priority: '0',
    tags: [],
    assignees: [],
    createdAt: '2026-08-14T09:30:00Z',
    updatedAt: '2026-08-14T09:30:00Z',
    ...overrides
  }
}

describe('odooCustomerRepoRouteKey', () => {
  it('qualifies the company id with its instance, since partner ids are per-database', () => {
    expect(odooCustomerRepoRouteKey(INSTANCE, 1633)).toBe(NOVACEL)
    expect(parseOdooCustomerRepoRouteKey(NOVACEL)).toEqual({
      instanceId: INSTANCE,
      companyId: 1633
    })
  })

  it('refuses a key it cannot scope to an instance', () => {
    expect(odooCustomerRepoRouteKey(undefined, 1633)).toBeNull()
    expect(odooCustomerRepoRouteKey(INSTANCE, undefined)).toBeNull()
    expect(parseOdooCustomerRepoRouteKey('1633')).toBeNull()
    expect(parseOdooCustomerRepoRouteKey(`${INSTANCE}:nope`)).toBeNull()
  })

  it('keys a ticket on its customer company, not its contact', () => {
    const raised = ticket({
      customer: { id: 41170, name: 'CAM - NOVACEL, Helene Mannina' },
      customerCompany: { id: 1633, name: 'CAM - NOVACEL' }
    })
    expect(odooTicketCustomerRepoRouteKey(raised)).toBe(NOVACEL)
  })
})

describe('odooCustomerRepoRouteTarget', () => {
  it("derives the host rather than assuming 'local', so writer and lookup agree", () => {
    expect(odooCustomerRepoRouteTarget({ id: 'repo-1' } as RepoHostParts)).toEqual({
      repoId: 'repo-1',
      executionHostId: 'local'
    })
    expect(
      odooCustomerRepoRouteTarget({ id: 'repo-1', connectionId: 'box' } as RepoHostParts)
    ).toEqual({ repoId: 'repo-1', executionHostId: 'ssh:box' })
  })
})

describe('parseOdooCustomerRepoRoutes', () => {
  it('falls back to an empty table for missing or malformed payloads', () => {
    expect(parseOdooCustomerRepoRoutes(null)).toEqual([])
    expect(parseOdooCustomerRepoRoutes('not json')).toEqual([])
    expect(parseOdooCustomerRepoRoutes('{}')).toEqual([])
  })

  it('drops a row that names no host rather than defaulting it to local', () => {
    // Guessing a host the user never picked could create the workspace on the
    // wrong machine; no row means the caller reports "not mapped" instead.
    expect(
      parseOdooCustomerRepoRoutes(
        JSON.stringify([
          { customer: NOVACEL, repoId: 'repo-1' },
          { ...route(), executionHostId: '  ' }
        ])
      )
    ).toEqual([])
  })

  it('drops rows with an unkeyable customer or no repo', () => {
    expect(
      parseOdooCustomerRepoRoutes(
        JSON.stringify([
          { customer: '1633', repoId: 'repo-1', executionHostId: 'local' },
          { customer: NOVACEL, repoId: '   ', executionHostId: 'local' },
          { repoId: 'repo-1', executionHostId: 'local' },
          'nonsense'
        ])
      )
    ).toEqual([])
  })

  it('keeps the first row per customer so a duplicated key stays one answer', () => {
    const parsed = parseOdooCustomerRepoRoutes(
      JSON.stringify([route(), route({ repoId: 'repo-2' })])
    )
    expect(parsed).toEqual([route()])
  })

  it('keeps a trimmed label and omits a blank one', () => {
    expect(
      parseOdooCustomerRepoRoutes(
        JSON.stringify([
          route({ customerName: '  CAM - NOVACEL  ' }),
          route({ customer: `${INSTANCE}:2`, customerName: '   ' })
        ])
      )
    ).toEqual([route({ customerName: 'CAM - NOVACEL' }), route({ customer: `${INSTANCE}:2` })])
  })
})

describe('upsertOdooCustomerRepoRoute', () => {
  it('replaces the row for a customer in place instead of piling up duplicates', () => {
    const next = upsertOdooCustomerRepoRoute([route()], route({ repoId: 'repo-2' }))
    expect(next).toEqual([route({ repoId: 'repo-2' })])
  })

  it('appends a new customer and ignores an unusable row', () => {
    const other = route({ customer: `${INSTANCE}:99`, repoId: 'repo-2' })
    expect(upsertOdooCustomerRepoRoute([route()], other)).toEqual([route(), other])
    expect(upsertOdooCustomerRepoRoute([route()], route({ repoId: '' }))).toEqual([route()])
  })

  it('removes by customer key', () => {
    expect(removeOdooCustomerRepoRoute([route()], NOVACEL)).toEqual([])
  })
})

describe('resolveOdooCustomerRepoTarget', () => {
  const repos: RepoHostParts[] = [{ id: 'repo-1' }, { id: 'repo-2', connectionId: 'box' }]

  const mapped = ticket({
    customer: { id: 41170, name: 'CAM - NOVACEL, Helene Mannina' },
    customerCompany: { id: 1633, name: 'CAM - NOVACEL' }
  })

  it('resolves a mapped customer to its repo', () => {
    const result = resolveOdooCustomerRepoTarget(mapped, [route()], repos)
    expect(result).toEqual({ matched: true, repo: repos[0], route: route() })
  })

  it('reports a ticket with no customer, which is normal for planning tasks', () => {
    const result = resolveOdooCustomerRepoTarget(ticket(), [route()], repos)
    expect(result).toEqual({ matched: false, reason: 'no-customer', customer: null, route: null })
  })

  it('separates an unresolved company from a customer-less ticket', () => {
    // A remote host that predates `customerCompany` publishes `customer` alone;
    // so does an ACL-refused res.partner read. Neither means "no customer".
    const result = resolveOdooCustomerRepoTarget(
      ticket({ customer: { id: 41170, name: 'CAM - NOVACEL, Helene Mannina' } }),
      [route()],
      repos
    )
    expect(result).toEqual({
      matched: false,
      reason: 'company-unresolved',
      customer: null,
      route: null
    })
  })

  it('reports a company that has no row yet, without falling back to a repo', () => {
    const result = resolveOdooCustomerRepoTarget(mapped, [], repos)
    expect(result).toEqual({ matched: false, reason: 'no-route', customer: NOVACEL, route: null })
  })

  it('reports a row whose repo is gone', () => {
    const stale = route({ repoId: 'removed' })
    const result = resolveOdooCustomerRepoTarget(mapped, [stale], repos)
    expect(result).toEqual({
      matched: false,
      reason: 'repo-missing',
      customer: NOVACEL,
      route: stale
    })
  })

  it('never matches the same repo id on another host', () => {
    // `repos` is a cross-host union, so `Repo.id` is not unique: a bare-id find
    // would hand back the SSH repo for a row that named the local one.
    const crossHost: RepoHostParts[] = [
      { id: 'shared', connectionId: 'box' },
      { id: 'shared', executionHostId: 'runtime:env-1' }
    ]
    expect(resolveOdooCustomerRepoTarget(mapped, [route({ repoId: 'shared' })], crossHost)).toEqual(
      {
        matched: false,
        reason: 'repo-missing',
        customer: NOVACEL,
        route: route({ repoId: 'shared' })
      }
    )
    const sshRoute = route({ repoId: 'shared', executionHostId: 'ssh:box' })
    expect(resolveOdooCustomerRepoTarget(mapped, [sshRoute], crossHost)).toEqual({
      matched: true,
      repo: crossHost[0],
      route: sshRoute
    })
  })
})

describe('stored table', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    })

    writeOdooCustomerRepoRoutes([route({ customerName: 'CAM - NOVACEL' })])
    expect(readOdooCustomerRepoRoutes()).toEqual([route({ customerName: 'CAM - NOVACEL' })])
    expect(store.has('odoo.customerRepoRoutes')).toBe(true)
  })

  it('survives storage that throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('disabled')
        },
        setItem: () => {
          throw new Error('quota')
        }
      }
    })

    expect(() => writeOdooCustomerRepoRoutes([route()])).not.toThrow()
    expect(readOdooCustomerRepoRoutes()).toEqual([])
  })
})
