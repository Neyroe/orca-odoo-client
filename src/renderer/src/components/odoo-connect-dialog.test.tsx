// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connectOdoo: vi.fn(),
  updateOdooApiKey: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      connectOdoo: mocks.connectOdoo,
      updateOdooApiKey: mocks.updateOdooApiKey,
      settings: { activeRuntimeEnvironmentId: null },
      setContextualToursBlockingSurfaceVisible: vi.fn()
    })
}))

import { OdooConnectDialog } from './odoo-connect-dialog'

const INSTANCE = {
  id: 'inst-1',
  serverUrl: 'https://odoo.example.test',
  database: 'prod',
  login: 'dev@example.test'
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

beforeEach(() => {
  mocks.connectOdoo.mockReset()
  mocks.updateOdooApiKey.mockReset()
})

afterEach(cleanup)

describe('OdooConnectDialog in rotation mode', () => {
  it('prefills and locks the identifying triple, leaving the key empty', () => {
    render(<OdooConnectDialog open onOpenChange={vi.fn()} instance={INSTANCE} />)

    expect(screen.getByText('Update Odoo API key')).toBeInTheDocument()
    expect(field('Odoo server URL')).toHaveValue('https://odoo.example.test')
    expect(field('Odoo server URL')).toHaveAttribute('readonly')
    expect(field('Database')).toHaveAttribute('readonly')
    expect(field('Login')).toHaveAttribute('readonly')
    // A prefilled key would be resubmitted as the "new" one.
    expect(field('API key')).toHaveValue('')
    expect(field('API key')).not.toHaveAttribute('readonly')
  })

  it('submits only the key, through the rotation action', async () => {
    const onOpenChange = vi.fn()
    mocks.updateOdooApiKey.mockResolvedValue({ ok: true, viewer: null })
    render(<OdooConnectDialog open onOpenChange={onOpenChange} instance={INSTANCE} />)

    await userEvent.type(field('API key'), 'rotated')
    await userEvent.click(screen.getByRole('button', { name: 'Update key' }))

    expect(mocks.updateOdooApiKey).toHaveBeenCalledWith(INSTANCE, 'rotated')
    expect(mocks.connectOdoo).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open and shows the reason when the key is refused', async () => {
    const onOpenChange = vi.fn()
    mocks.updateOdooApiKey.mockResolvedValue({ ok: false, error: 'AccessDenied' })
    render(<OdooConnectDialog open onOpenChange={onOpenChange} instance={INSTANCE} />)

    await userEvent.type(field('API key'), 'typo')
    await userEvent.click(screen.getByRole('button', { name: 'Update key' }))

    expect(screen.getByText('AccessDenied')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('still connects a new instance when no instance is given', async () => {
    mocks.connectOdoo.mockResolvedValue({ ok: true, viewer: null })
    render(<OdooConnectDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Connect Odoo server')).toBeInTheDocument()
    await userEvent.type(field('Odoo server URL'), 'odoo.example.test')
    await userEvent.type(field('Database'), 'prod')
    await userEvent.type(field('Login'), 'dev@example.test')
    await userEvent.type(field('API key'), 'key')
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(mocks.connectOdoo).toHaveBeenCalledWith({
      serverUrl: 'odoo.example.test',
      database: 'prod',
      login: 'dev@example.test',
      apiKey: 'key'
    })
    expect(mocks.updateOdooApiKey).not.toHaveBeenCalled()
  })
})
