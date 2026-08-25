import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_USER_TOKEN } from '../../shared/odoo-domain-tokens'
import type { OdooInstance, OdooProjectScope } from '../../shared/odoo-types'

const mocks = vi.hoisted(() => ({ executeKw: vi.fn(), getClients: vi.fn() }))

vi.mock('./client', () => ({
  acquire: async () => {},
  release: () => {},
  executeKw: mocks.executeKw,
  getClients: mocks.getClients
}))

const { listTickets, searchTickets } = await import('./tickets')

function instance(id: string, uid = 2): OdooInstance {
  return {
    id,
    serverUrl: `https://${id}.odoo.com`,
    database: id,
    login: 'admin',
    uid,
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

describe('raw-domain composition', () => {
  beforeEach(() => {
    mocks.executeKw.mockReset()
    mocks.getClients.mockReset()
  })

  const OR_DOMAIN = ['|', ['name', 'ilike', 'x'], ['name', 'ilike', 'y']]

  function scope(
    projectsByInstance: { instanceId: string; projectIds: number[] }[]
  ): OdooProjectScope {
    return { projectsByInstance, includeNoProject: false }
  }

  it('closes the caller domain in its own group, outside the project scope', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await searchTickets(OR_DOMAIN, 30, undefined, scope([{ instanceId: 'alpha', projectIds: [7] }]))

    // The scope leaf sits after the OR's two operands, so no operator of the
    // caller's domain can reach it.
    expect(mocks.executeKw.mock.calls[0]?.[3]?.[0]).toEqual([
      '&',
      ['has_template_ancestor', '=', false],
      ['has_project_template', '=', false],
      '|',
      ['name', 'ilike', 'x'],
      ['name', 'ilike', 'y'],
      ['project_id', 'in', [7]]
    ])
  })

  it('refuses a domain with a dangling operator instead of reading with it', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])

    // Spliced flat this '|' would have eaten the project leaf and quietly
    // widened the read to every project.
    await expect(
      searchTickets(['|', ['name', 'ilike', 'x']], 30, undefined, scope([]))
    ).rejects.toThrow('The "|" operator at position 0 is missing an operand.')
    expect(mocks.executeKw).not.toHaveBeenCalled()
  })

  it('refuses an invalid domain even with no instance connected', async () => {
    mocks.getClients.mockReturnValue([])

    await expect(searchTickets([['name', '==', 'x']], 30)).rejects.toThrow(
      'The condition at position 0 uses an unknown operator "==".'
    )
  })

  it('composes a preset read through the same three fragments', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha'), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await listTickets('assigned', 30, undefined, scope([{ instanceId: 'alpha', projectIds: [7] }]))

    expect(mocks.executeKw.mock.calls[0]?.[3]?.[0]).toEqual([
      '&',
      ['has_template_ancestor', '=', false],
      ['has_project_template', '=', false],
      '&',
      ['state', 'not in', ['1_done', '1_canceled']],
      ['user_ids', 'in', [2]],
      ['project_id', 'in', [7]]
    ])
  })
})

describe('current-user token', () => {
  beforeEach(() => {
    mocks.executeKw.mockReset()
    mocks.getClients.mockReset()
  })

  function domainOf(nth: number): unknown[] {
    return mocks.executeKw.mock.calls[nth]?.[3]?.[0] as unknown[]
  }

  it('resolves the same stored token to a different user on each instance', async () => {
    // The whole point: uid is per database, so a filter that stored `180` would
    // read a stranger's tickets on the second instance without erroring.
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha', 7), apiKey: 'k' },
      { instance: instance('beta', 180), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValue([])

    await searchTickets([['user_ids', 'in', [CURRENT_USER_TOKEN]]], 30)

    expect(domainOf(0)).toContainEqual(['user_ids', 'in', [7]])
    expect(domainOf(1)).toContainEqual(['user_ids', 'in', [180]])
  })

  it('resolves a token used as a scalar value', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha', 7), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await searchTickets([['create_uid', '=', CURRENT_USER_TOKEN]], 30)

    expect(domainOf(0)).toContainEqual(['create_uid', '=', 7])
  })

  it('resolves a token nested in the subdomain of an `any` leaf', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha', 7), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await searchTickets([['message_ids', 'any', [['author_id', '=', CURRENT_USER_TOKEN]]]], 30)

    expect(domainOf(0)).toContainEqual(['message_ids', 'any', [['author_id', '=', 7]]])
  })

  it('leaves a domain without a token untouched', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha', 7), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await searchTickets([['user_ids', 'in', [180]]], 30)

    expect(domainOf(0)).toContainEqual(['user_ids', 'in', [180]])
  })

  it('passes a value that merely looks like a token through as a literal', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha', 7), apiKey: 'k' }])
    mocks.executeKw.mockResolvedValueOnce([])

    await searchTickets([['name', 'ilike', '@me']], 30)

    expect(domainOf(0)).toContainEqual(['name', 'ilike', '@me'])
  })

  it('refuses a near-miss inside the reserved namespace instead of searching for it', async () => {
    mocks.getClients.mockReturnValue([{ instance: instance('alpha', 7), apiKey: 'k' }])

    await expect(searchTickets([['user_ids', 'in', ['$orca:mee']]], 30)).rejects.toThrow(
      'The condition at position 0 uses an unknown Orca token "$orca:mee".'
    )
    expect(mocks.executeKw).not.toHaveBeenCalled()
  })

  it('resolves the token of a seeded preset per instance too', async () => {
    mocks.getClients.mockReturnValue([
      { instance: instance('alpha', 7), apiKey: 'k' },
      { instance: instance('beta', 180), apiKey: 'k' }
    ])
    mocks.executeKw.mockResolvedValue([])

    await listTickets('assigned', 30)

    expect(domainOf(0)).toContainEqual(['user_ids', 'in', [7]])
    expect(domainOf(1)).toContainEqual(['user_ids', 'in', [180]])
  })
})
