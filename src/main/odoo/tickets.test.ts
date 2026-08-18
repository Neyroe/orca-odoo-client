import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OdooInstance, OdooProjectScope } from '../../shared/odoo-types'

const mocks = vi.hoisted(() => ({ executeKw: vi.fn(), getClients: vi.fn() }))

vi.mock('./client', () => ({
  acquire: async () => {},
  release: () => {},
  executeKw: mocks.executeKw,
  getClients: mocks.getClients
}))

const { listTickets, searchTickets } = await import('./tickets')

function instance(id: string): OdooInstance {
  return {
    id,
    serverUrl: `https://${id}.odoo.com`,
    database: id,
    login: 'admin',
    uid: 2,
    displayName: id
  }
}

/** One row shaped so `loadLookups` needs no extra round trip. */
function row(id: number, priority: string, writeDate: string): Record<string, unknown> {
  return { id, name: `Task ${id}`, priority, write_date: writeDate, create_date: writeDate }
}

describe('cross-instance ticket reads', () => {
  beforeEach(() => {
    mocks.executeKw.mockReset()
    mocks.getClients.mockReset()
  })

  it('cuts the flattened fan-out back to the requested limit', async () => {
    // The read runs once per instance with the same limit, so without the merge
    // a 2-instance fan-out returns `limit x 2` tickets.
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha'), apiKey: 'k' },
      { instance: instance('beta'), apiKey: 'k' }
    ])
    mocks.executeKw
      .mockResolvedValueOnce([
        row(1, '1', '2026-08-10 10:00:00'),
        row(2, '0', '2026-08-09 10:00:00')
      ])
      .mockResolvedValueOnce([
        row(3, '3', '2026-08-01 10:00:00'),
        row(4, '0', '2026-08-14 10:00:00')
      ])

    const tickets = await listTickets('all', 2)

    expect(tickets).toHaveLength(2)
    // Odoo's own order (priority desc, then write_date desc) re-applied globally.
    expect(tickets.map((ticket) => ticket.id)).toEqual([3, 1])
  })

  it('leaves a result already within the limit untouched', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([
      row(1, '0', '2026-08-10 10:00:00'),
      row(2, '3', '2026-08-09 10:00:00')
    ])

    const tickets = await searchTickets([], 30)

    expect(tickets.map((ticket) => ticket.id)).toEqual([1, 2])
  })
})

describe('project-scoped ticket reads', () => {
  beforeEach(() => {
    mocks.executeKw.mockReset()
    mocks.getClients.mockReset()
  })

  /** The domain `search_read` was called with, for the nth read. */
  function domainOfCall(nth: number): unknown[] {
    return mocks.executeKw.mock.calls[nth]?.[3]?.[0] as unknown[]
  }

  function scope(
    projectsByInstance: { instanceId: string; projectIds: number[] }[],
    includeNoProject = false
  ): OdooProjectScope {
    return { projectsByInstance, includeNoProject }
  }

  it('appends the project leaf to the preset domain', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([row(1, '0', '2026-08-10 10:00:00')])

    await listTickets('assigned', 30, undefined, scope([{ instanceId: 'alpha', projectIds: [7] }]))

    const domain = domainOfCall(0)
    expect(domain).toContainEqual(['project_id', 'in', [7]])
    // The preset's own leaves must survive alongside it — "assigned to me, on
    // project X", not one or the other.
    expect(domain).toContainEqual(['user_ids', 'in', [2]])
    expect(domain).toContainEqual(['has_template_ancestor', '=', false])
  })

  it('sends several selected projects as one in-leaf', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await listTickets('all', 30, undefined, scope([{ instanceId: 'alpha', projectIds: [7, 9] }]))

    expect(domainOfCall(0)).toContainEqual(['project_id', 'in', [7, 9]])
  })

  it('scopes to tickets with no project on the no-project scope', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await listTickets('all', 30, undefined, scope([], true))

    const domain = domainOfCall(0)
    expect(domain).toContainEqual(['project_id', '=', false])
    // Never an empty `in`: it matches nothing, so AND-ing one would zero a result
    // that should have been the no-project leaf alone.
    expect(domain).not.toContainEqual(['project_id', 'in', []])
  })

  it('ORs the no-project leaf with the selected projects', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await listTickets('all', 30, undefined, scope([{ instanceId: 'alpha', projectIds: [7] }], true))

    const domain = domainOfCall(0)
    // Odoo prefix notation: '|' followed by its two operands, inside the
    // surrounding implicit AND.
    const operator = domain.indexOf('|')
    expect(operator).toBeGreaterThanOrEqual(0)
    expect(domain[operator + 1]).toEqual(['project_id', 'in', [7]])
    expect(domain[operator + 2]).toEqual(['project_id', '=', false])
  })

  it('narrows each instance by its own ids, never a foreign one', async () => {
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha'), apiKey: 'k' },
      { instance: instance('beta'), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValue([])

    await listTickets(
      'all',
      30,
      undefined,
      scope([
        { instanceId: 'alpha', projectIds: [7] },
        { instanceId: 'beta', projectIds: [3] }
      ])
    )

    expect(mocks.executeKw).toHaveBeenCalledTimes(2)
    const byInstance = new Map(
      mocks.executeKw.mock.calls.map((call) => [call[0]?.instance.id, call[3]?.[0]])
    )
    expect(byInstance.get('alpha')).toContainEqual(['project_id', 'in', [7]])
    expect(byInstance.get('beta')).toContainEqual(['project_id', 'in', [3]])
  })

  it('leaves an unselected instance out without spending a read on it', async () => {
    // Project ids are per-database, so 'beta' cannot hold alpha's project 7.
    // Reading it anyway would cost a round trip whose rows could only be dropped.
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha'), apiKey: 'k' },
      { instance: instance('beta'), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValueOnce([row(1, '0', '2026-08-10 10:00:00')])

    const tickets = await listTickets(
      'all',
      30,
      undefined,
      scope([{ instanceId: 'alpha', projectIds: [7] }])
    )

    expect(tickets.map((ticket) => ticket.id)).toEqual([1])
    // One search_read (alpha's) — beta never reached the wire. `loadLookups`
    // adds no call here because the row carries no user/tag/stage reference.
    expect(mocks.executeKw).toHaveBeenCalledTimes(1)
    expect(mocks.executeKw.mock.calls[0]?.[0]?.instance.id).toBe('alpha')
  })

  it('still reads an unselected instance when no-project is included', async () => {
    // 'No project' is instance-agnostic, so every instance can answer it.
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha'), apiKey: 'k' },
      { instance: instance('beta'), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValue([])

    await listTickets('all', 30, undefined, scope([{ instanceId: 'alpha', projectIds: [7] }], true))

    expect(mocks.executeKw).toHaveBeenCalledTimes(2)
    const byInstance = new Map(
      mocks.executeKw.mock.calls.map((call) => [call[0]?.instance.id, call[3]?.[0]])
    )
    expect(byInstance.get('beta')).toContainEqual(['project_id', '=', false])
    expect(byInstance.get('beta')).not.toContainEqual(['project_id', 'in', []])
  })

  it('applies the same scoping to a raw domain search', async () => {
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha'), apiKey: 'k' },
      { instance: instance('beta'), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValueOnce([])

    await searchTickets(
      [['name', 'ilike', 'invoice']],
      30,
      undefined,
      scope([{ instanceId: 'beta', projectIds: [3] }])
    )

    expect(mocks.executeKw).toHaveBeenCalledTimes(1)
    const domain = domainOfCall(0)
    expect(domain).toContainEqual(['name', 'ilike', 'invoice'])
    expect(domain).toContainEqual(['project_id', 'in', [3]])
  })

  it('reads every instance when no scope is given', async () => {
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha'), apiKey: 'k' },
      { instance: instance('beta'), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValue([])

    await listTickets('all', 30)

    expect(mocks.executeKw).toHaveBeenCalledTimes(2)
  })
})
