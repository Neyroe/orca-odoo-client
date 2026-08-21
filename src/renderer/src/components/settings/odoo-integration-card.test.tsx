// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { OdooIntegrationCard } from './odoo-integration-card'

type StoreState = {
  odooStatus: {
    connected: boolean
    viewer: null
    instances?: { id: string; serverUrl: string; database: string; login: string }[]
    credentialError?: string
  }
  odooStatusChecked: boolean
  odooStatusContextKey: string | null
  odooRejectedCredential: {
    id: string
    serverUrl: string
    database: string
    login: string
  } | null
  checkOdooConnection: () => Promise<void>
  disconnectOdoo: (instanceId?: string) => Promise<void>
  testOdooConnection: (instanceId: string) => Promise<{ ok: boolean; error?: string }>
  settings: { activeRuntimeEnvironmentId: string | null }
  openSettingsPage: () => void
  openSettingsTarget: (target: { pane: string; repoId: string | null }) => void
}

const mocks = vi.hoisted(() => ({
  store: { current: null as StoreState | null },
  toastError: vi.fn(),
  // The dialog is stubbed, so its props are the only proof of which mode and
  // which instance the card opened it for.
  dialogProps: { current: null as Record<string, unknown> | null }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => {
    if (!mocks.store.current) {
      throw new Error('Store state was not installed')
    }
    return selector(mocks.store.current)
  }
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError }
}))

vi.mock('@/components/odoo-connect-dialog', () => ({
  OdooConnectDialog: (props: Record<string, unknown>) => {
    mocks.dialogProps.current = props
    return null
  }
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

function installStore(overrides: Partial<StoreState> = {}): StoreState {
  const settings = overrides.settings ?? { activeRuntimeEnvironmentId: null }
  const state: StoreState = {
    odooStatus: {
      connected: true,
      viewer: null,
      instances: [
        {
          id: 'inst-1',
          serverUrl: 'https://odoo.example.test',
          database: 'prod',
          login: 'dev@example.test'
        }
      ]
    },
    odooStatusChecked: true,
    odooStatusContextKey: getProviderRuntimeContextKey(settings),
    odooRejectedCredential: null,
    checkOdooConnection: vi.fn(async () => {}),
    disconnectOdoo: vi.fn(async () => {}),
    testOdooConnection: vi.fn(async () => ({ ok: true })),
    settings,
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    ...overrides
  }
  mocks.store.current = state
  return state
}

async function renderCard(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<OdooIntegrationCard />)
  })
  return container
}

describe('OdooIntegrationCard', () => {
  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    root = null
    container?.remove()
    container = null
    mocks.store.current = null
    mocks.toastError.mockReset()
    mocks.dialogProps.current = null
  })

  it('renders a localized status label', async () => {
    installStore()

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Connected')
  })

  it('renders a localized status label while disconnected', async () => {
    installStore({ odooStatus: { connected: false, viewer: null } })

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Not connected')
  })

  it('opens the dialog in rotation mode for the row it was clicked on', async () => {
    installStore()

    const rendered = await renderCard()
    const update = rendered.querySelector<HTMLButtonElement>(
      'button[aria-label="Update the API key for prod"]'
    )
    expect(update).not.toBeNull()

    await act(async () => {
      update?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.dialogProps.current?.open).toBe(true)
    expect(mocks.dialogProps.current?.instance).toMatchObject({ id: 'inst-1', database: 'prod' })
  })

  it('leaves the dialog in connect mode for Add Odoo instance', async () => {
    installStore()

    const rendered = await renderCard()
    const add = [...rendered.querySelectorAll('button')].find(
      (button) => button.textContent === 'Add Odoo instance'
    )
    expect(add).not.toBeUndefined()

    await act(async () => {
      add?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.dialogProps.current?.open).toBe(true)
    expect(mocks.dialogProps.current?.instance).toBeUndefined()
  })

  it('offers the rotation action while the rejected key leaves it disconnected', async () => {
    // The rejection wipes the instance rows, so the banner is the only path.
    installStore({
      odooStatus: { connected: false, viewer: null },
      odooRejectedCredential: {
        id: 'inst-1',
        serverUrl: 'https://odoo.example.test',
        database: 'prod',
        login: 'dev@example.test'
      }
    })

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Odoo rejected the stored API key for prod')
    const update = [...rendered.querySelectorAll('button')].find(
      (button) => button.textContent === 'Update API key'
    )
    expect(update).not.toBeUndefined()

    await act(async () => {
      update?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.dialogProps.current?.instance).toMatchObject({ id: 'inst-1' })
  })

  it('surfaces a failed disconnect instead of dropping the rejection', async () => {
    const state = installStore({
      disconnectOdoo: vi.fn(async () => {
        throw new Error('runtime unreachable')
      })
    })

    const rendered = await renderCard()
    const disconnect = rendered.querySelector<HTMLButtonElement>(
      'button[aria-label="Disconnect prod"]'
    )
    expect(disconnect).not.toBeNull()

    await act(async () => {
      disconnect?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(state.disconnectOdoo).toHaveBeenCalledWith('inst-1')
    expect(mocks.toastError).toHaveBeenCalledWith('Could not disconnect Odoo.', {
      description: 'runtime unreachable'
    })
  })
})
