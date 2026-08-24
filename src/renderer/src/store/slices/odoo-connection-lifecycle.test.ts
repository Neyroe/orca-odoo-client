import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import type { OdooConnectionStatus, OdooInstance } from '../../../../shared/odoo-types'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'

type CredentialResult = { ok: true; viewer: null } | { ok: false; error: string }

const mocks = vi.hoisted(() => ({
  odooStatus: vi.fn<() => Promise<OdooConnectionStatus>>(),
  odooTestConnection: vi.fn(),
  odooUpdateApiKey: vi.fn(),
  odooDisconnect: vi.fn()
}))

vi.mock('@/runtime/runtime-odoo-client', () => ({
  odooConnect: vi.fn(),
  odooDisconnect: (...args: unknown[]) => mocks.odooDisconnect(...args),
  odooSelectInstance: vi.fn(),
  odooStatus: () => mocks.odooStatus(),
  odooTestConnection: (...args: unknown[]) => mocks.odooTestConnection(...args),
  odooUpdateApiKey: (...args: unknown[]) => mocks.odooUpdateApiKey(...args)
}))

const { createOdooConnectionLifecycle } = await import('./odoo-connection-lifecycle')

function instance(overrides: Partial<OdooInstance> = {}): OdooInstance {
  return {
    id: 'inst-1',
    serverUrl: 'https://odoo.example.test',
    database: 'prod',
    login: 'dev@example.test',
    uid: 7,
    displayName: 'Prod',
    ...overrides
  }
}

type Harness = {
  lifecycle: ReturnType<typeof createOdooConnectionLifecycle>
  checkOdooConnection: () => Promise<void>
  state: () => AppState
  setCount: () => number
}

function createHarness(
  initialStatus: OdooConnectionStatus,
  extraState: Partial<AppState> = {}
): Harness {
  let setCalls = 0
  const settings = { activeRuntimeEnvironmentId: null } as AppState['settings']
  const state = {
    settings,
    odooStatus: initialStatus,
    odooStatusChecked: true,
    // Every successful poll stamps this; starting unstamped would read as a
    // runtime switch and reset context-scoped state on the first call.
    odooStatusContextKey: getProviderRuntimeContextKey(settings),
    odooRejectedCredential: null,
    ...extraState
  } as unknown as AppState

  const set: StoreApi<AppState>['setState'] = (partial) => {
    setCalls += 1
    Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
  }
  const get = (() => state) as StoreApi<AppState>['getState']
  const lifecycle = createOdooConnectionLifecycle({ set, get, clearInflight: () => {} })
  // Reads reach for the store's own action; the lifecycle owns it here.
  Object.assign(state, lifecycle)
  return {
    lifecycle,
    checkOdooConnection: lifecycle.checkOdooConnection,
    state: () => state,
    setCount: () => setCalls
  }
}

describe('checkOdooConnection instance comparison', () => {
  beforeEach(() => {
    mocks.odooStatus.mockReset()
  })

  it('adopts a renamed instance even though the instance count is unchanged', async () => {
    const harness = createHarness({
      connected: true,
      viewer: null,
      instances: [instance()]
    })
    // First call stamps the context key so a later `set` can only come from the
    // instance comparison itself.
    mocks.odooStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      instances: [instance()]
    })
    await harness.checkOdooConnection()
    const baseline = harness.setCount()

    // One field at a time: changing both at once would still pass if the
    // signature dropped either of them.
    mocks.odooStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      instances: [instance({ displayName: 'Production EU' })]
    })
    await harness.checkOdooConnection()

    expect(harness.setCount()).toBe(baseline + 1)
    expect(harness.state().odooStatus.instances?.[0]?.displayName).toBe('Production EU')

    mocks.odooStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      instances: [instance({ displayName: 'Production EU', serverUrl: 'https://eu.example.test' })]
    })
    await harness.checkOdooConnection()

    expect(harness.setCount()).toBe(baseline + 2)
    expect(harness.state().odooStatus.instances?.[0]?.serverUrl).toBe('https://eu.example.test')
  })

  it('skips the update when the instance list is unchanged', async () => {
    const harness = createHarness({
      connected: true,
      viewer: null,
      instances: [instance()]
    })
    mocks.odooStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      instances: [instance()]
    })
    await harness.checkOdooConnection()
    const baseline = harness.setCount()

    await harness.checkOdooConnection()

    expect(harness.setCount()).toBe(baseline)
  })
})

describe('API key rotation', () => {
  beforeEach(() => {
    mocks.odooStatus.mockReset()
    mocks.odooTestConnection.mockReset()
    mocks.odooUpdateApiKey.mockReset()
    mocks.odooDisconnect.mockReset()
    mocks.odooStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      instances: [instance()]
    })
  })

  it('clears the rejection banner once the new key verifies', async () => {
    const harness = createHarness({ connected: false, viewer: null }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)
    mocks.odooUpdateApiKey.mockResolvedValue({ ok: true, viewer: null } satisfies CredentialResult)

    const result = await harness.lifecycle.updateOdooApiKey(instance(), 'new-key')

    expect(result.ok).toBe(true)
    expect(harness.state().odooRejectedCredential).toBeNull()
    // The rotation re-polls so Settings leaves the disconnected state.
    expect(harness.state().odooStatus.connected).toBe(true)
  })

  it('keeps the rejection banner when the new key is refused', async () => {
    const harness = createHarness({ connected: false, viewer: null }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)
    mocks.odooUpdateApiKey.mockResolvedValue({
      ok: false,
      error: 'AccessDenied'
    } satisfies CredentialResult)

    const result = await harness.lifecycle.updateOdooApiKey(instance(), 'typo')

    expect(result).toEqual({ ok: false, error: 'AccessDenied' })
    expect(harness.state().odooRejectedCredential).not.toBeNull()
  })

  it('does not clear the banner when a rotation targets another instance', async () => {
    const harness = createHarness({ connected: false, viewer: null }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)
    mocks.odooUpdateApiKey.mockResolvedValue({ ok: true, viewer: null } satisfies CredentialResult)

    await harness.lifecycle.updateOdooApiKey(instance({ id: 'inst-2' }), 'new-key')

    expect(harness.state().odooRejectedCredential).not.toBeNull()
  })

  it('clears the banner when its instance verifies through Test connection', async () => {
    const harness = createHarness({ connected: true, viewer: null, instances: [instance()] }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)
    mocks.odooTestConnection.mockResolvedValue({
      ok: true,
      viewer: null
    } satisfies CredentialResult)

    await harness.lifecycle.testOdooConnection('inst-1')

    expect(harness.state().odooRejectedCredential).toBeNull()
  })

  it('clears the banner when its instance is disconnected', async () => {
    const harness = createHarness({ connected: true, viewer: null, instances: [instance()] }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)
    mocks.odooDisconnect.mockResolvedValue(undefined)

    await harness.lifecycle.disconnectOdoo('inst-1')

    expect(harness.state().odooRejectedCredential).toBeNull()
  })

  it('survives a status poll, which cannot tell a rejected key from a good one', async () => {
    const harness = createHarness({ connected: false, viewer: null }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)

    await harness.checkOdooConnection()

    expect(harness.state().odooRejectedCredential).not.toBeNull()
  })

  it('drops the banner when the runtime context changes', async () => {
    const harness = createHarness({ connected: true, viewer: null, instances: [instance()] }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)

    // Switching runtimes switches credential stores; the id would name an
    // instance the new host has never heard of.
    harness.state().settings = { activeRuntimeEnvironmentId: 'env-2' } as AppState['settings']
    await harness.checkOdooConnection()

    expect(harness.state().odooRejectedCredential).toBeNull()
  })

  it('drops the banner once the poll no longer lists the instance', async () => {
    const harness = createHarness({ connected: true, viewer: null, instances: [instance()] }, {
      odooRejectedCredential: instance()
    } as Partial<AppState>)
    mocks.odooStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      instances: [instance({ id: 'inst-2' })]
    })

    await harness.checkOdooConnection()

    expect(harness.state().odooRejectedCredential).toBeNull()
  })
})
