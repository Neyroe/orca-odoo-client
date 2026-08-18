import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type { OdooProjectScope, OdooTicket } from '../../../../shared/odoo-types'
import { OdooProjectScopeUnsupportedError } from '@/runtime/runtime-odoo-client'
import { createOdooSlice } from './odoo'

const odooListTickets = vi.fn()
const odooSearchTickets = vi.fn()
const odooGetTicket = vi.fn()

vi.mock('@/runtime/runtime-odoo-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    odooGetTicket: (...args: unknown[]) => odooGetTicket(...args),
    odooListTickets: (...args: unknown[]) => odooListTickets(...args),
    odooSearchTickets: (...args: unknown[]) => odooSearchTickets(...args)
  }
})

const SCOPE: OdooProjectScope = {
  projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
  includeNoProject: false
}

function createTestStore() {
  return create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createOdooSlice(...a)
      }) as AppState
  )
}

function ticket(id: number): OdooTicket {
  return {
    id,
    ref: `#${id}`,
    title: `Ticket ${id}`,
    url: `https://odoo.example/${id}`,
    state: '01_in_progress',
    priority: '0',
    tags: [],
    assignees: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

describe('project scope on the Odoo list reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards the scope to the read', async () => {
    odooListTickets.mockResolvedValue([ticket(1)])
    const store = createTestStore()

    await store.getState().listOdooTickets('assigned', 50, { projectScope: SCOPE })

    expect(odooListTickets).toHaveBeenCalledWith(null, 'assigned', 50, null, SCOPE)
  })

  it('does not serve a scoped read from an unscoped cache entry', async () => {
    odooListTickets.mockResolvedValueOnce([ticket(1)]).mockResolvedValueOnce([ticket(2)])
    const store = createTestStore()

    await store.getState().listOdooTickets('assigned', 50)
    const scoped = await store.getState().listOdooTickets('assigned', 50, { projectScope: SCOPE })

    // A warm unscoped page answers a different question, so the scoped read must
    // still go out rather than reuse it.
    expect(odooListTickets).toHaveBeenCalledTimes(2)
    expect(scoped.map((entry) => entry.id)).toEqual([2])
  })

  it('keeps two different project scopes on separate cache entries', async () => {
    odooListTickets.mockResolvedValueOnce([ticket(1)]).mockResolvedValueOnce([ticket(2)])
    const store = createTestStore()

    await store.getState().listOdooTickets('assigned', 50, { projectScope: SCOPE })
    await store.getState().listOdooTickets('assigned', 50, {
      projectScope: {
        projectsByInstance: [{ instanceId: 'inst-a', projectIds: [8] }],
        includeNoProject: false
      }
    })

    expect(odooListTickets).toHaveBeenCalledTimes(2)
  })

  it('separates the no-project scope from an unscoped read', async () => {
    odooListTickets.mockResolvedValue([])
    const store = createTestStore()

    await store.getState().listOdooTickets('all', 50)
    await store.getState().listOdooTickets('all', 50, {
      projectScope: { projectsByInstance: [], includeNoProject: true }
    })

    expect(odooListTickets).toHaveBeenCalledTimes(2)
  })

  it('surfaces an unsupported-scope failure instead of an empty list', async () => {
    odooListTickets.mockRejectedValueOnce(new OdooProjectScopeUnsupportedError())
    const store = createTestStore()

    // The list reads swallow credential failures; this one must reach the panel,
    // or a skewed remote reads as "no tickets on this project".
    await expect(
      store.getState().listOdooTickets('assigned', 50, { projectScope: SCOPE })
    ).rejects.toBeInstanceOf(OdooProjectScopeUnsupportedError)
  })

  it('leaves a warm scoped cache intact when a later read is refused', async () => {
    odooListTickets.mockResolvedValueOnce([ticket(1)])
    const store = createTestStore()
    await store.getState().listOdooTickets('assigned', 50, { projectScope: SCOPE })

    odooListTickets.mockRejectedValueOnce(new OdooProjectScopeUnsupportedError())
    await expect(
      store.getState().listOdooTickets('assigned', 50, { projectScope: SCOPE, forceRefresh: true })
    ).rejects.toBeInstanceOf(OdooProjectScopeUnsupportedError)

    const cached = Object.values(store.getState().odooTicketListCache)
    expect(cached).toHaveLength(1)
    expect(cached[0]?.data?.map((entry) => entry.id)).toEqual([1])
  })

  it('forwards the scope on the search read too', async () => {
    odooSearchTickets.mockResolvedValue([])
    const store = createTestStore()
    const domain = [['name', 'ilike', 'invoice']]

    await store.getState().searchOdooTickets(domain, 50, { projectScope: SCOPE })

    expect(odooSearchTickets).toHaveBeenCalledWith(null, domain, 50, null, SCOPE)
  })
})
