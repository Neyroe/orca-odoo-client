import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isOdooCurrentUserTokenUnsupportedError,
  isOdooProjectScopeUnsupportedError,
  odooSearchTickets,
  OdooCurrentUserTokenUnsupportedError,
  OdooProjectScopeUnsupportedError
} from './runtime-odoo-client'
import {
  createCompatibleRuntimeStatusResponse,
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { CURRENT_USER_TOKEN } from '../../../shared/odoo-domain-tokens'
import {
  ODOO_DOMAIN_TOKENS_RUNTIME_CAPABILITY,
  ODOO_PROJECT_SCOPE_RUNTIME_CAPABILITY
} from '../../../shared/protocol-version'
import type { OdooProjectScope } from '../../../shared/odoo-types'

const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()
const searchTicketsLocal = vi.fn()

/** Carries no `$orca:` token, so only the project scope is negotiated. */
const PLAIN_DOMAIN = [['name', 'ilike', 'invoice']]

const SCOPE: OdooProjectScope = {
  projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
  includeNoProject: false
}

/** A remote whose advertised capabilities predate the `$orca:` namespace. */
function stubRuntimeWithoutDomainTokens(): void {
  const oldServerStatus = createCompatibleRuntimeStatusResponse('runtime-old')
  if (oldServerStatus.ok) {
    oldServerStatus.result.capabilities = oldServerStatus.result.capabilities?.filter(
      (capability) => capability !== ODOO_DOMAIN_TOKENS_RUNTIME_CAPABILITY
    )
  }
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) =>
    args.method === 'status.get' ? oldServerStatus : runtimeEnvironmentCall(args)
  )
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
  searchTicketsLocal.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation(
    (args: RuntimeEnvironmentCallRequest) =>
      createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  )
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall },
      odoo: { searchTickets: searchTicketsLocal }
    }
  })
})

describe('project-scoped reads against a remote runtime', () => {
  it('sends the scope to a runtime that advertises support', async () => {
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-search',
      ok: true,
      result: [{ id: 1 }],
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, PLAIN_DOMAIN, 50, 'inst-a', SCOPE)
    ).resolves.toEqual([{ id: 1 }])

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'odoo.searchTickets',
        params: { domain: PLAIN_DOMAIN, limit: 50, instanceId: 'inst-a', projectScope: SCOPE }
      })
    )
  })

  it('refuses a scoped read before an older runtime can answer unscoped', async () => {
    stubRuntimeWithoutProjectScope()

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, PLAIN_DOMAIN, 50, 'inst-a', SCOPE)
    ).rejects.toMatchObject({
      name: 'OdooProjectScopeUnsupportedError',
      message: 'This remote runtime must be updated to filter Odoo tickets by project.'
    })

    // The read never left the client: unscoped rows must not be presented, nor
    // cached, as if they were the project's.
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('still serves an unscoped read from that older runtime', async () => {
    stubRuntimeWithoutProjectScope()
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-search',
      ok: true,
      result: [{ id: 2 }],
      _meta: { runtimeId: 'runtime-old' }
    })

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, PLAIN_DOMAIN, 50, 'inst-a')
    ).resolves.toEqual([{ id: 2 }])
    // No projectScope key at all, rather than an explicit undefined.
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { domain: PLAIN_DOMAIN, limit: 50, instanceId: 'inst-a' }
      })
    )
  })
})

describe('project-scoped reads against the local runtime', () => {
  it('passes the scope straight to IPC without a capability probe', async () => {
    searchTicketsLocal.mockResolvedValue([{ id: 3 }])

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: null }, PLAIN_DOMAIN, 50, 'inst-a', SCOPE)
    ).resolves.toEqual([{ id: 3 }])

    // Main and renderer ship together locally, so there is no skew to negotiate.
    expect(runtimeEnvironmentTransportCall).not.toHaveBeenCalled()
    expect(searchTicketsLocal).toHaveBeenCalledWith({
      domain: PLAIN_DOMAIN,
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
    const failure = await odooSearchTickets(
      { activeRuntimeEnvironmentId: 'env-1' },
      PLAIN_DOMAIN,
      50,
      'inst-a',
      SCOPE
    ).catch((error: unknown) => error)
    expect(isOdooProjectScopeUnsupportedError(failure)).toBe(true)
  })
})

describe('current-user token against a remote runtime', () => {
  const TOKEN_DOMAIN = [['user_ids', 'in', [CURRENT_USER_TOKEN]]]

  it('sends a token domain to a runtime that advertises support', async () => {
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-search',
      ok: true,
      result: [{ id: 1 }],
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, TOKEN_DOMAIN, 50)
    ).resolves.toEqual([{ id: 1 }])

    // Unresolved on the wire on purpose: the host resolves it per instance.
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'odoo.searchTickets',
        params: { domain: TOKEN_DOMAIN, limit: 50, instanceId: undefined }
      })
    )
  })

  it('refuses a token domain before an older runtime forwards it to Odoo as a string', async () => {
    stubRuntimeWithoutDomainTokens()

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, TOKEN_DOMAIN, 50)
    ).rejects.toMatchObject({
      name: 'OdooCurrentUserTokenUnsupportedError',
      message: 'This remote runtime must be updated to filter Odoo tickets by the current user.'
    })

    // Sent, it would fail inside `search_read` with a server error naming neither
    // the token nor the version skew behind it.
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('negotiates on the namespace, not on the tokens this build knows', async () => {
    // An older host cannot resolve any `$orca:` value, including one added after
    // it shipped.
    stubRuntimeWithoutDomainTokens()

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, [['id', '=', '$orca:future']], 50)
    ).rejects.toBeInstanceOf(OdooCurrentUserTokenUnsupportedError)
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('still serves a token-free search from that older runtime', async () => {
    stubRuntimeWithoutDomainTokens()
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-search',
      ok: true,
      result: [{ id: 2 }],
      _meta: { runtimeId: 'runtime-old' }
    })

    await expect(
      odooSearchTickets({ activeRuntimeEnvironmentId: 'env-1' }, [['name', 'ilike', '@me']], 50)
    ).resolves.toEqual([{ id: 2 }])
    expect(runtimeEnvironmentCall).toHaveBeenCalledTimes(1)
  })

  it('reads a local target without negotiating at all', async () => {
    searchTicketsLocal.mockResolvedValueOnce([{ id: 4 }])

    await expect(odooSearchTickets({}, TOKEN_DOMAIN, 50)).resolves.toEqual([{ id: 4 }])
    expect(searchTicketsLocal).toHaveBeenCalledWith(
      expect.objectContaining({ domain: TOKEN_DOMAIN })
    )
  })

  it('recognises its own error type', () => {
    expect(isOdooCurrentUserTokenUnsupportedError(new OdooCurrentUserTokenUnsupportedError())).toBe(
      true
    )
    expect(isOdooCurrentUserTokenUnsupportedError(new OdooProjectScopeUnsupportedError())).toBe(
      false
    )
    expect(isOdooProjectScopeUnsupportedError(new OdooCurrentUserTokenUnsupportedError())).toBe(
      false
    )
  })
})
