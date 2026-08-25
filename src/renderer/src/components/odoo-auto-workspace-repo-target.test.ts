import { describe, expect, it } from 'vitest'

import {
  odooAutoWorkspaceRepoOwnerSettings,
  resolveOdooAutoWorkspaceRepoTarget
} from './odoo-auto-workspace-repo-target'
import type { OdooCustomerRepoRoute } from './odoo-customer-repo-routes'
import type { OdooTicket } from '../../../shared/odoo-types'
import type { Repo } from '../../../shared/repo-types'

const COMPANY = { id: 7, name: 'Acme' }
const CUSTOMER_KEY = 'inst-a:7'

function ticket(overrides: Partial<OdooTicket> = {}): OdooTicket {
  return {
    id: 1,
    ref: '#1',
    instanceId: 'inst-a',
    customer: { id: 9, name: 'Jane' },
    customerCompany: COMPANY,
    ...overrides
  } as OdooTicket
}

function repo(id: string, executionHostId: string | null = null): Repo {
  return { id, path: `/repos/${id}`, displayName: id, executionHostId } as unknown as Repo
}

const ROUTE: OdooCustomerRepoRoute = {
  customer: CUSTOMER_KEY,
  repoId: 'acme',
  executionHostId: 'local'
}

describe('resolveOdooAutoWorkspaceRepoTarget', () => {
  it('routes a ticket to its customer repo', () => {
    const target = resolveOdooAutoWorkspaceRepoTarget({
      ticket: ticket(),
      routes: [ROUTE],
      repos: [repo('acme')],
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(target).toMatchObject({ ok: true, hostId: 'local' })
  })

  it.each([
    ['no-customer', { customer: undefined, customerCompany: undefined }],
    ['company-unresolved', { customerCompany: undefined }]
  ])('passes through the L3 reason %s', (reason, overrides) => {
    const target = resolveOdooAutoWorkspaceRepoTarget({
      ticket: ticket(overrides),
      routes: [ROUTE],
      repos: [repo('acme')],
      settings: null
    })

    expect(target).toEqual({ ok: false, reason })
  })

  it('distinguishes an unmapped customer from a repo the store lost', () => {
    expect(
      resolveOdooAutoWorkspaceRepoTarget({
        ticket: ticket(),
        routes: [],
        repos: [repo('acme')],
        settings: null
      })
    ).toEqual({ ok: false, reason: 'no-route' })
    expect(
      resolveOdooAutoWorkspaceRepoTarget({
        ticket: ticket(),
        routes: [ROUTE],
        repos: [],
        settings: null
      })
    ).toEqual({ ok: false, reason: 'repo-missing' })
  })

  it('refuses when a bare id would reach another host than the route names', () => {
    const target = resolveOdooAutoWorkspaceRepoTarget({
      ticket: ticket(),
      // The route points at the SSH copy, but `createWorktree` takes no host and
      // its bare-id lookup lands on the focused local one.
      routes: [{ ...ROUTE, executionHostId: 'ssh:build-box' }],
      repos: [repo('acme'), repo('acme', 'ssh:build-box')],
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(target).toEqual({ ok: false, reason: 'repo-ambiguous' })
  })

  it('refuses when the id is duplicated even within the focused host', () => {
    const target = resolveOdooAutoWorkspaceRepoTarget({
      ticket: ticket(),
      routes: [ROUTE],
      repos: [repo('acme'), { ...repo('acme'), path: '/repos/acme-2' }],
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(target).toEqual({ ok: false, reason: 'repo-ambiguous' })
  })

  it('refuses when the route names another host than the one a bare id reaches', () => {
    const target = resolveOdooAutoWorkspaceRepoTarget({
      ticket: ticket(),
      routes: [{ ...ROUTE, executionHostId: 'ssh:build-box' }],
      repos: [repo('acme', 'ssh:build-box'), repo('acme-local', 'local')],
      // A bare-id lookup finds the SSH repo uniquely here, so this one resolves.
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(target).toMatchObject({ ok: true, hostId: 'ssh:build-box' })
  })
})

describe('odooAutoWorkspaceRepoOwnerSettings', () => {
  it('points a runtime repo at its own environment, not the focused one', () => {
    expect(
      odooAutoWorkspaceRepoOwnerSettings(
        { activeRuntimeEnvironmentId: null },
        { connectionId: null, executionHostId: 'runtime:env-1' }
      )
    ).toEqual({ activeRuntimeEnvironmentId: 'env-1' })
  })

  it('leaves a repo claiming no host on the focused runtime, as the create does', () => {
    expect(
      odooAutoWorkspaceRepoOwnerSettings(
        { activeRuntimeEnvironmentId: 'env-1' },
        { connectionId: null, executionHostId: null }
      )
    ).toEqual({ activeRuntimeEnvironmentId: 'env-1' })
  })

  it('takes an explicitly local repo off the focused runtime', () => {
    expect(
      odooAutoWorkspaceRepoOwnerSettings(
        { activeRuntimeEnvironmentId: 'env-1' },
        { connectionId: null, executionHostId: 'local' }
      )
    ).toEqual({ activeRuntimeEnvironmentId: null })
  })

  it('takes an SSH repo off the focused runtime', () => {
    expect(
      odooAutoWorkspaceRepoOwnerSettings(
        { activeRuntimeEnvironmentId: 'env-1' },
        { connectionId: 'conn-1', executionHostId: 'ssh:build-box' }
      )
    ).toEqual({ activeRuntimeEnvironmentId: null })
  })
})
