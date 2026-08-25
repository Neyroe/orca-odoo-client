// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  runPass: vi.fn(),
  checkOdooConnection: vi.fn(),
  settings: { enabled: true, savedFilterId: 'mine' as string | null, maxPerRun: 3 },
  connected: true,
  statusChecked: true
}))

vi.mock('@/components/odoo-auto-workspace-run', () => ({
  runOdooAutoWorkspacePass: mocks.runPass
}))

vi.mock('@/components/odoo-auto-workspace-settings', () => ({
  readOdooAutoWorkspaceSettings: () => mocks.settings
}))

const storeState = (): unknown => ({
  odooStatus: { connected: mocks.connected },
  odooStatusChecked: mocks.statusChecked,
  checkOdooConnection: mocks.checkOdooConnection
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: ReturnType<typeof storeState>) => unknown) => selector(storeState()),
    { getState: storeState }
  )
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mocks.runPass.mockReset().mockResolvedValue(undefined)
  mocks.checkOdooConnection.mockReset().mockResolvedValue(undefined)
  mocks.statusChecked = true
  mocks.settings = { enabled: true, savedFilterId: 'mine', maxPerRun: 3 }
  mocks.connected = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function mount(): Promise<void> {
  const { useOdooAutoWorkspace } = await import('./use-odoo-auto-workspace')
  function Probe(): null {
    useOdooAutoWorkspace()
    return null
  }
  await act(async () => root.render(<Probe />))
}

describe('useOdooAutoWorkspace', () => {
  it('runs a pass as soon as it mounts connected, with no Odoo panel in sight', async () => {
    await mount()

    expect(mocks.runPass).toHaveBeenCalledTimes(1)
    expect(mocks.runPass).toHaveBeenCalledWith(
      mocks.settings,
      expect.objectContaining({ handled: expect.any(Set), reported: expect.any(Set) })
    )
  })

  it('does nothing while Odoo is disconnected', async () => {
    mocks.connected = false

    await mount()

    expect(mocks.runPass).not.toHaveBeenCalled()
  })

  it('does nothing while the feature is disarmed', async () => {
    mocks.settings = { enabled: false, savedFilterId: null, maxPerRun: 3 }

    await mount()

    expect(mocks.runPass).not.toHaveBeenCalled()
  })

  it('asks Odoo for its status itself, since no panel is open to do it', async () => {
    mocks.statusChecked = false
    mocks.connected = false

    await mount()

    expect(mocks.checkOdooConnection).toHaveBeenCalledTimes(1)
  })

  it('leaves the status probe alone while disarmed', async () => {
    mocks.statusChecked = false
    mocks.connected = false
    mocks.settings = { enabled: false, savedFilterId: null, maxPerRun: 3 }

    await mount()

    expect(mocks.checkOdooConnection).not.toHaveBeenCalled()
  })

  it('carries one session across passes, so a handled ticket stays handled', async () => {
    await mount()
    const first = mocks.runPass.mock.calls[0]?.[1]
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {})

    expect(mocks.runPass.mock.calls[1]?.[1] ?? first).toBe(first)
  })
})
