import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isOdooProjectScopeUnsupportedError,
  odooListTickets,
  odooSearchTickets,
  OdooProjectScopeUnsupportedError
} from './runtime-odoo-client'
import {
  createCompatibleRuntimeStatusResponse,
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { ODOO_PROJECT_SCOPE_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { OdooProjectScope } from '../../../shared/odoo-types'

const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()
const listTicketsLocal = vi.fn()
const searchTicketsLocal = vi.fn()

const SCOPE: OdooProjectScope = {
  projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
  includeNoProject: false
}

/** A remote whose advertised capabilities predate the project scope. */
function stubRuntimeWithoutProjectScope(): void {
  const oldServerStatus = createCompatibleRuntimeStatusResponse('runtime-old')
  if (oldServerStatus.ok) {
    oldServerStatus.result.capabilities = oldServerStatus.result.capabilities?.filter(
      (capability) => capability !== ODOO_PROJECT_SCOPE_RUNTIME_CAPABILITY
    )
  }
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) =>
    args.method === 'status.get' ? oldServerStatus : runtimeEnvironmentCall(args)
  )
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  listTicketsLocal.mockReset()
  searchTicketsLocal.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation(
    (args: RuntimeEnvironmentCallRequest) =>
      createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  )
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall },
      odoo: { listTickets: listTicketsLocal, searchTickets: searchTicketsLocal }
    }
  })
})

describe('project-scoped reads against a remote runtime', () => {
  it('sends the scope to a runtime that advertises support', async () => {
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-list',
      ok: true,
      result: [{ id: 1 }],
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(
      odooListTickets({ activeRuntimeEnvironmentId: 'env-1' }, 'assigned', 50, 'inst-a', SCOPE)
    ).resolves.toEqual([{ id: 1 }])

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'odoo.listTickets',
        params: { filter: 'assigned', limit: 50, instanceId: 'inst-a', projectScope: SCOPE }
      })
    )
  })

  it('refuses a scoped list before an older runtime can answer unscoped', async () => {
    stubRuntimeWithoutProjectScope()

    await expect(
      odooListTickets({ activeRuntimeEnvironmentId: 'env-1' }, 'assigned', 50, 'inst-a', SCOPE)
    ).rejects.toMatchObject({
      name: 'OdooProjectScopeUnsupportedError',
      message: 'This remote runtime must be updated to filter Odoo tickets by project.'
    })

    // The read never left the client: unscoped rows must not be presented, nor
    // cached, as if they were the project's.
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('refuses a scoped search on the same runtime', async () => {
    stubRuntimeWithoutProjectScope()

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, [], 50, 'inst-a', SCOPE)
    ).rejects.toMatchObject({ name: 'OdooProjectScopeUnsupportedError' })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('still serves an unscoped read from that older runtime', async () => {
    stubRuntimeWithoutProjectScope()
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-list',
      ok: true,
      result: [{ id: 2 }],
      _meta: { runtimeId: 'runtime-old' }
    })

    await expect(
      odooListTickets({ activeRuntimeEnvironmentId: 'env-1' }, 'assigned', 50, 'inst-a')
    ).resolves.toEqual([{ id: 2 }])
    // No projectScope key at all, rather than an explicit undefined.
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { filter: 'assigned', limit: 50, instanceId: 'inst-a' }
      })
    )
  })
})

describe('project-scoped reads against the local runtime', () => {
  it('passes the scope straight to IPC without a capability probe', async () => {
    listTicketsLocal.mockResolvedValue([{ id: 3 }])

    await expect(
      odooListTickets({ activeRuntimeEnvironmentId: null }, 'all', 50, 'inst-a', SCOPE)
    ).resolves.toEqual([{ id: 3 }])

    // Main and renderer ship together locally, so there is no skew to negotiate.
    expect(runtimeEnvironmentTransportCall).not.toHaveBeenCalled()
    expect(listTicketsLocal).toHaveBeenCalledWith({
      filter: 'all',
      limit: 50,
      instanceId: 'inst-a',
      projectScope: SCOPE
    })
  })
})

describe('isOdooProjectScopeUnsupportedError', () => {
  // The panel branches on this to drop the previous scope's rows, so a false
  // negative would leave another project's tickets under the error banner.
  it('recognises the typed error and nothing else', () => {
    expect(isOdooProjectScopeUnsupportedError(new OdooProjectScopeUnsupportedError())).toBe(true)
    expect(isOdooProjectScopeUnsupportedError(new Error('Network request failed'))).toBe(false)
    expect(isOdooProjectScopeUnsupportedError('not an error')).toBe(false)
    expect(isOdooProjectScopeUnsupportedError(undefined)).toBe(false)
  })

  it('survives the reject path the store rethrows it through', async () => {
    stubRuntimeWithoutProjectScope()
    const failure = await odooListTickets(
      { activeRuntimeEnvironmentId: 'env-1' },
      'assigned',
      50,
      'inst-a',
      SCOPE
    ).catch((error: unknown) => error)
    expect(isOdooProjectScopeUnsupportedError(failure)).toBe(true)
  })
})
