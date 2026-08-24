import { beforeEach, describe, expect, it, vi } from 'vitest'
import { odooUpdateApiKey, type OdooUpdatableInstance } from './runtime-odoo-credential-client'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()
const updateApiKeyLocal = vi.fn()

const INSTANCE: OdooUpdatableInstance = {
  id: 'inst-a',
  serverUrl: 'https://odoo.example.test',
  database: 'prod',
  login: 'dev@example.test'
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  updateApiKeyLocal.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation(
    (args: RuntimeEnvironmentCallRequest) =>
      createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  )
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall },
      odoo: { updateApiKey: updateApiKeyLocal }
    }
  })
})

describe('odooUpdateApiKey', () => {
  it('sends only the instance id and the new key locally', async () => {
    updateApiKeyLocal.mockResolvedValue({ ok: true, viewer: { uid: 7 } })

    await expect(odooUpdateApiKey({}, INSTANCE, 'new-key')).resolves.toEqual({
      ok: true,
      viewer: { uid: 7 }
    })
    expect(updateApiKeyLocal).toHaveBeenCalledWith({ instanceId: 'inst-a', apiKey: 'new-key' })
  })

  it('rotates through the dedicated method on a current remote', async () => {
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-update',
      ok: true,
      result: { ok: true, viewer: { uid: 7 } },
      _meta: { runtimeId: 'runtime-1' }
    })

    await odooUpdateApiKey({ activeRuntimeEnvironmentId: 'env-1' }, INSTANCE, 'new-key')

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'odoo.updateApiKey',
        params: { instanceId: 'inst-a', apiKey: 'new-key' }
      })
    )
  })

  it('falls back to connect on a remote that predates the method', async () => {
    runtimeEnvironmentCall.mockImplementation((args: { method: string }) =>
      args.method === 'odoo.updateApiKey'
        ? {
            id: 'rpc-update',
            ok: false,
            error: { code: 'method_not_found', message: 'Unknown method: odoo.updateApiKey' },
            _meta: { runtimeId: 'runtime-old' }
          }
        : {
            id: 'rpc-connect',
            ok: true,
            result: { ok: true, viewer: { uid: 7 } },
            _meta: { runtimeId: 'runtime-old' }
          }
    )

    await expect(
      odooUpdateApiKey({ activeRuntimeEnvironmentId: 'env-1' }, INSTANCE, 'new-key')
    ).resolves.toEqual({ ok: true, viewer: { uid: 7 } })

    // The triple travels only on this path, and it is the instance's own.
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'odoo.connect',
        params: {
          serverUrl: 'https://odoo.example.test',
          database: 'prod',
          login: 'dev@example.test',
          apiKey: 'new-key'
        }
      })
    )
  })

  it('does not retry as a connect when the remote refused the key', async () => {
    runtimeEnvironmentCall.mockResolvedValueOnce({
      id: 'rpc-update',
      ok: false,
      error: { code: 'internal', message: 'AccessDenied' },
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(
      odooUpdateApiKey({ activeRuntimeEnvironmentId: 'env-1' }, INSTANCE, 'typo')
    ).rejects.toThrow('AccessDenied')
    expect(
      runtimeEnvironmentCall.mock.calls.filter(([args]) => args.method === 'odoo.connect')
    ).toHaveLength(0)
  })
})
