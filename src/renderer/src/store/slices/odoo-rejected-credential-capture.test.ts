import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type { OdooInstance } from '../../../../shared/odoo-types'
import { createOdooSlice } from './odoo'

const odooSearchTickets = vi.fn()
const odooGetTicket = vi.fn()
const odooStatus = vi.fn()

vi.mock('@/runtime/runtime-odoo-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    odooGetTicket: (...args: unknown[]) => odooGetTicket(...args),
    odooSearchTickets: (...args: unknown[]) => odooSearchTickets(...args),
    odooStatus: (...args: unknown[]) => odooStatus(...args)
  }
})

const OPEN_DOMAIN = [['state', 'not in', ['1_done', '1_canceled']]]

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

function createTestStore(instances: OdooInstance[], selectedInstanceId: string) {
  const store = create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createOdooSlice(...a)
      }) as AppState
  )
  store.setState({
    odooStatus: { connected: true, viewer: null, instances, selectedInstanceId },
    odooStatusChecked: true
  } as Partial<AppState>)
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  odooStatus.mockResolvedValue({ connected: true, viewer: null, instances: [instance()] })
})

describe('capturing the instance behind a rejected API key', () => {
  it('names the instance from a failed list read before the status wipe', async () => {
    odooSearchTickets.mockRejectedValue(new Error('AccessDenied: invalid API key'))
    const store = createTestStore([instance()], 'inst-1')

    await store.getState().searchOdooTickets(OPEN_DOMAIN, 50)

    // The wipe is what drops the instance rows, so the snapshot has to be taken
    // from the state the wipe replaces.
    expect(store.getState().odooStatus.connected).toBe(false)
    expect(store.getState().odooRejectedCredential).toEqual({
      id: 'inst-1',
      serverUrl: 'https://odoo.example.test',
      database: 'prod',
      login: 'dev@example.test'
    })
  })

  it('names the instance a failed detail read asked for, not the selected one', async () => {
    odooGetTicket.mockRejectedValue(new Error('AccessDenied: invalid API key'))
    const store = createTestStore(
      [instance(), instance({ id: 'inst-2', database: 'staging' })],
      'inst-1'
    )

    await store.getState().fetchOdooTicket(42, 'inst-2')

    expect(store.getState().odooRejectedCredential?.database).toBe('staging')
  })

  it('leaves a record-permission failure alone', async () => {
    // Odoo raises AccessError while the key stays valid; only credential
    // rejection may flip Settings to disconnected.
    odooSearchTickets.mockRejectedValue(new Error('AccessError: you cannot read this record'))
    const store = createTestStore([instance()], 'inst-1')

    await expect(store.getState().searchOdooTickets(OPEN_DOMAIN, 50)).rejects.toThrow('AccessError')

    expect(store.getState().odooStatus.connected).toBe(true)
    expect(store.getState().odooRejectedCredential).toBeNull()
  })
})
