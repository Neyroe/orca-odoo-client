import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OdooInstance } from '../../shared/odoo-types'

const mocks = vi.hoisted(() => ({
  getInstanceFile: vi.fn(),
  writeInstanceFile: vi.fn(),
  saveKey: vi.fn(),
  authenticate: vi.fn(),
  executeKw: vi.fn()
}))

vi.mock('./instance-credentials', () => ({
  deleteKey: vi.fn(),
  getInstanceFile: mocks.getInstanceFile,
  getInstanceId: vi.fn(),
  getStatus: vi.fn(),
  normalizeOdooServerUrl: (value: string) => value,
  OdooServerUrlError: class extends Error {},
  readKey: vi.fn(),
  saveKey: mocks.saveKey,
  writeInstanceFile: mocks.writeInstanceFile
}))

vi.mock('./json-rpc', () => ({
  acquire: vi.fn(async () => {}),
  authenticate: mocks.authenticate,
  executeKw: mocks.executeKw,
  release: vi.fn(),
  isAuthError: vi.fn(),
  OdooApiError: class extends Error {}
}))

const { updateApiKey } = await import('./client')

function instance(overrides: Partial<OdooInstance> = {}): OdooInstance {
  return {
    id: 'inst-1',
    serverUrl: 'https://odoo.example.test',
    database: 'prod',
    login: 'dev@example.test',
    uid: 7,
    displayName: 'Dev',
    ...overrides
  }
}

const second = instance({ id: 'inst-2', database: 'staging', uid: 9, displayName: 'Staging' })

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
  mocks.getInstanceFile.mockReturnValue({
    version: 1,
    activeInstanceId: 'inst-1',
    selectedInstanceId: 'all',
    instances: [instance(), second]
  })
})

describe('updateApiKey', () => {
  it('replaces the key without disturbing order, active id, or selection', async () => {
    mocks.authenticate.mockResolvedValue(11)
    mocks.executeKw.mockResolvedValue([{ name: 'Staging Admin', login: 'dev@example.test' }])

    await expect(updateApiKey({ instanceId: 'inst-2', apiKey: ' rotated ' })).resolves.toEqual({
      ok: true,
      viewer: { uid: 11, displayName: 'Staging Admin', login: 'dev@example.test' }
    })

    // The triple comes from the stored instance, never from the caller.
    expect(mocks.authenticate).toHaveBeenCalledWith(
      'https://odoo.example.test',
      'staging',
      'dev@example.test',
      'rotated'
    )
    expect(mocks.saveKey).toHaveBeenCalledWith('inst-2', 'rotated')
    expect(mocks.writeInstanceFile).toHaveBeenCalledWith({
      version: 1,
      activeInstanceId: 'inst-1',
      selectedInstanceId: 'all',
      instances: [instance(), { ...second, uid: 11, displayName: 'Staging Admin' }]
    })
  })

  it('keeps the working key when the server refuses the new one', async () => {
    mocks.authenticate.mockRejectedValue(new Error('AccessDenied'))

    await expect(updateApiKey({ instanceId: 'inst-1', apiKey: 'typo' })).resolves.toEqual({
      ok: false,
      error: 'AccessDenied'
    })
    expect(mocks.saveKey).not.toHaveBeenCalled()
    expect(mocks.writeInstanceFile).not.toHaveBeenCalled()
  })

  it('refuses an unknown instance before reaching the server', async () => {
    await expect(updateApiKey({ instanceId: 'inst-9', apiKey: 'key' })).resolves.toEqual({
      ok: false,
      error: 'Not connected to Odoo.'
    })
    expect(mocks.authenticate).not.toHaveBeenCalled()
  })

  it('refuses a blank key before reaching the server', async () => {
    await expect(updateApiKey({ instanceId: 'inst-1', apiKey: '   ' })).resolves.toEqual({
      ok: false,
      error: 'API key is required.'
    })
    expect(mocks.authenticate).not.toHaveBeenCalled()
  })

  it('does not resurrect an instance disconnected during the round trip', async () => {
    mocks.authenticate.mockResolvedValue(11)
    mocks.executeKw.mockResolvedValue([{ name: 'Dev', login: 'dev@example.test' }])
    mocks.getInstanceFile
      .mockReturnValueOnce({
        version: 1,
        activeInstanceId: 'inst-1',
        selectedInstanceId: 'inst-1',
        instances: [instance()]
      })
      .mockReturnValue({
        version: 1,
        activeInstanceId: null,
        selectedInstanceId: null,
        instances: []
      })

    await expect(updateApiKey({ instanceId: 'inst-1', apiKey: 'rotated' })).resolves.toEqual({
      ok: false,
      error: 'Not connected to Odoo.'
    })
    expect(mocks.saveKey).not.toHaveBeenCalled()
    expect(mocks.writeInstanceFile).not.toHaveBeenCalled()
  })
})
