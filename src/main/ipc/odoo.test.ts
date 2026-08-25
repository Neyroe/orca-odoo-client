import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ handle: vi.fn(), searchTickets: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../odoo/client', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getStatus: vi.fn(),
  selectInstance: vi.fn(),
  testConnection: vi.fn(),
  updateApiKey: vi.fn()
}))
vi.mock('../odoo/tickets', () => ({
  createTicket: vi.fn(),
  getTicket: vi.fn(),
  listAssignableUsers: vi.fn(),
  listProjects: vi.fn(),
  listStageNames: vi.fn(),
  listStages: vi.fn(),
  listTags: vi.fn(),
  listTickets: vi.fn(),
  searchTickets: mocks.searchTickets,
  updateTicket: vi.fn()
}))
vi.mock('./odoo-ticket-chatter', () => ({ registerOdooTicketChatterHandlers: vi.fn() }))

const { registerOdooHandlers } = await import('./odoo')

type Handler = (event: unknown, args: unknown) => Promise<unknown>

function searchHandler(): Handler {
  registerOdooHandlers()
  const entry = mocks.handle.mock.calls.find(([channel]) => channel === 'odoo:searchTickets')
  if (!entry) {
    throw new Error('odoo:searchTickets was not registered')
  }
  return entry[1] as Handler
}

describe('odoo:searchTickets', () => {
  beforeEach(() => {
    mocks.handle.mockReset()
    mocks.searchTickets.mockReset()
    mocks.searchTickets.mockResolvedValue([])
  })

  it('runs a well-formed domain', async () => {
    const domain = ['|', ['name', 'ilike', 'x'], ['s_raf', '>', 0]]

    await searchHandler()(null, { domain, limit: 30 })

    expect(mocks.searchTickets).toHaveBeenCalledWith(domain, 30, undefined, undefined)
  })

  it('rejects an unbalanced domain instead of answering "no tickets"', async () => {
    // An empty result is indistinguishable from a filter that matched nothing,
    // so the user would never learn the domain was broken.
    await expect(searchHandler()(null, { domain: ['|', ['name', 'ilike', 'x']] })).rejects.toThrow(
      'The "|" operator at position 0 is missing an operand.'
    )
    expect(mocks.searchTickets).not.toHaveBeenCalled()
  })

  it('rejects a malformed leaf', async () => {
    await expect(searchHandler()(null, { domain: [['name', '==', 'x']] })).rejects.toThrow(
      'The condition at position 0 uses an unknown operator "==".'
    )
    expect(mocks.searchTickets).not.toHaveBeenCalled()
  })

  it('rejects a domain that is not a list', async () => {
    await expect(searchHandler()(null, { domain: 'name ilike x' })).rejects.toThrow(
      'A domain must be a list of conditions.'
    )
    await expect(searchHandler()(null, {})).rejects.toThrow(
      'A domain must be a list of conditions.'
    )
    expect(mocks.searchTickets).not.toHaveBeenCalled()
  })

  it('still accepts the empty match-all domain', async () => {
    await searchHandler()(null, { domain: [] })

    expect(mocks.searchTickets).toHaveBeenCalledWith([], 30, undefined, undefined)
  })
})
