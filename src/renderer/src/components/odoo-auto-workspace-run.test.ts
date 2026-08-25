// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { writeOdooCustomerRepoRoutes } from './odoo-customer-repo-routes'
import { writeSavedOdooTicketFilters } from './odoo-saved-ticket-filters'
import { DEFAULT_ODOO_TICKET_FILTERS } from './odoo-ticket-facets'
import type { OdooAutoWorkspaceSession } from './odoo-auto-workspace-run'
import type { OdooPriority, OdooTicket, OdooTicketState } from '../../../shared/odoo-types'

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  searchOdooTickets: vi.fn(),
  createWorktree: vi.fn(),
  getBaseRefDefault: vi.fn(),
  worktrees: [] as { linkedOdooTicket?: number }[],
  repos: [] as { id: string; path: string; displayName: string; executionHostId: string | null }[]
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@/runtime/runtime-repo-client', () => ({
  getRuntimeRepoBaseRefDefault: mocks.getBaseRefDefault
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      odooStatus: {
        connected: true,
        viewer: { uid: 4 },
        instances: [
          { id: 'inst-a', serverUrl: 'https://odoo.test', database: 'db', displayName: 'Odoo' }
        ]
      },
      settings: { activeRuntimeEnvironmentId: null },
      repos: mocks.repos,
      allWorktrees: () => mocks.worktrees,
      searchOdooTickets: mocks.searchOdooTickets,
      createWorktree: mocks.createWorktree
    })
  }
}))

const COMPANY = { id: 7, name: 'Acme' }

function ticket(id: number, overrides: Partial<OdooTicket> = {}): OdooTicket {
  return {
    id,
    ref: `#${id}`,
    title: `Ticket ${id}`,
    url: `https://odoo.test/${id}`,
    instanceId: 'inst-a',
    state: '01_in_progress' as OdooTicketState,
    customer: { id: 9, name: 'Jane' },
    customerCompany: COMPANY,
    assignees: [],
    tags: [],
    ...overrides
  } as OdooTicket
}

function armFilter(priorities: OdooPriority[] = []): void {
  writeSavedOdooTicketFilters([
    { id: 'mine', name: 'Mine', filters: { ...DEFAULT_ODOO_TICKET_FILTERS, priorities } }
  ])
}

function armRoute(): void {
  writeOdooCustomerRepoRoutes([{ customer: 'inst-a:7', repoId: 'acme', executionHostId: 'local' }])
}

function session(): OdooAutoWorkspaceSession {
  return { handled: new Set(), reported: new Set() }
}

const SETTINGS = { enabled: true, savedFilterId: 'mine', maxPerRun: 3 }

async function runPass(state: OdooAutoWorkspaceSession, settings = SETTINGS): Promise<void> {
  const { runOdooAutoWorkspacePass } = await import('./odoo-auto-workspace-run')
  await runOdooAutoWorkspacePass(settings, state)
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.toast.success.mockReset()
  mocks.toast.warning.mockReset()
  mocks.toast.error.mockReset()
  mocks.searchOdooTickets.mockReset().mockResolvedValue([])
  mocks.createWorktree.mockReset().mockResolvedValue({})
  mocks.getBaseRefDefault.mockReset().mockResolvedValue({ defaultBaseRef: 'origin/main' })
  mocks.worktrees = []
  mocks.repos = [{ id: 'acme', path: '/repos/acme', displayName: 'acme', executionHostId: null }]
})

describe('runOdooAutoWorkspacePass — its own read', () => {
  it('reads Odoo for the armed filter rather than for whatever a panel shows', async () => {
    armFilter(['3'])
    armRoute()

    await runPass(session())

    expect(mocks.searchOdooTickets).toHaveBeenCalledWith(
      [['priority', 'in', ['3']]],
      200,
      expect.objectContaining({ projectScope: null })
    )
  })

  it('follows the filter by id, so editing it changes what is armed', async () => {
    armFilter(['3'])
    await runPass(session())
    armFilter(['0'])
    await runPass(session())

    expect(mocks.searchOdooTickets.mock.calls[0]?.[0]).toEqual([['priority', 'in', ['3']]])
    expect(mocks.searchOdooTickets.mock.calls[1]?.[0]).toEqual([['priority', 'in', ['0']]])
  })

  it('creates nothing and says so when the filter is gone', async () => {
    await runPass(session())

    expect(mocks.searchOdooTickets).not.toHaveBeenCalled()
    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Auto-start points at a saved filter that no longer exists.',
      expect.anything()
    )
  })

  it('reports a failed read once rather than on every pass', async () => {
    armFilter()
    mocks.searchOdooTickets.mockRejectedValue(new Error('relay down'))
    const state = session()

    await runPass(state)
    await runPass(state)

    expect(mocks.toast.warning).toHaveBeenCalledTimes(1)
  })
})

describe('runOdooAutoWorkspacePass — the closed-ticket invariant', () => {
  it.each(['1_done', '1_canceled'])(
    'never creates a workspace for a %s ticket the filter returned',
    async (state) => {
      armFilter()
      armRoute()
      mocks.searchOdooTickets.mockResolvedValue([ticket(1, { state: state as OdooTicketState })])

      await runPass(session())

      expect(mocks.createWorktree).not.toHaveBeenCalled()
    }
  )

  it('still creates for the open tickets beside them', async () => {
    armFilter()
    armRoute()
    mocks.searchOdooTickets.mockResolvedValue([ticket(1, { state: '1_done' }), ticket(2)])

    await runPass(session())

    expect(mocks.createWorktree).toHaveBeenCalledTimes(1)
    expect(mocks.createWorktree.mock.calls[0]?.[0]).toBe('acme')
  })
})

describe('runOdooAutoWorkspacePass — the customer repo and the base branch', () => {
  it('starts in the customer repo, on its primary branch, passed explicitly', async () => {
    armFilter()
    armRoute()
    mocks.searchOdooTickets.mockResolvedValue([ticket(1)])

    await runPass(session())

    expect(mocks.getBaseRefDefault).toHaveBeenCalledWith(
      { activeRuntimeEnvironmentId: null },
      'acme',
      'local'
    )
    const [repoId, , baseBranch] = mocks.createWorktree.mock.calls[0] ?? []
    expect(repoId).toBe('acme')
    expect(baseBranch).toBe('origin/main')
    expect(mocks.toast.success).toHaveBeenCalledWith('Started a workspace for #1.')
  })

  it('skips rather than falling back when no primary branch resolves', async () => {
    armFilter()
    armRoute()
    mocks.getBaseRefDefault.mockResolvedValue({ defaultBaseRef: null })
    mocks.searchOdooTickets.mockResolvedValue([ticket(1)])

    await runPass(session())

    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Auto-start found no default branch in the mapped repository.',
      expect.anything()
    )
  })

  it.each([
    [
      'no customer',
      { customer: undefined, customerCompany: undefined },
      'Auto-start skipped tickets with no customer.'
    ],
    [
      'an unresolved company',
      { customerCompany: undefined },
      "Auto-start could not read the customer's company on some tickets."
    ]
  ])('names %s as its own reason', async (_label, overrides, message) => {
    armFilter()
    armRoute()
    mocks.searchOdooTickets.mockResolvedValue([ticket(1, overrides)])

    await runPass(session())

    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith(message, expect.anything())
  })

  it('names an unmapped customer apart from a missing repo', async () => {
    armFilter()
    mocks.searchOdooTickets.mockResolvedValue([ticket(1)])
    await runPass(session())
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Auto-start has no repository mapped for these customers.',
      expect.anything()
    )

    mocks.toast.warning.mockReset()
    armRoute()
    mocks.repos = []
    await runPass(session())
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Auto-start maps these customers to a repository Orca no longer has.',
      expect.anything()
    )
  })

  it('refuses a repo id two hosts share instead of guessing one', async () => {
    armFilter()
    // The route names the SSH copy, but createWorktree takes no host.
    writeOdooCustomerRepoRoutes([
      { customer: 'inst-a:7', repoId: 'acme', executionHostId: 'ssh:box' }
    ])
    mocks.repos = [
      { id: 'acme', path: '/a', displayName: 'acme', executionHostId: null },
      { id: 'acme', path: '/b', displayName: 'acme', executionHostId: 'ssh:box' }
    ]
    mocks.searchOdooTickets.mockResolvedValue([ticket(1)])

    await runPass(session())

    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Auto-start cannot tell which host owns the mapped repository.',
      expect.anything()
    )
  })

  it('groups unroutable tickets into one notice, said once per session', async () => {
    armFilter()
    mocks.searchOdooTickets.mockResolvedValue([ticket(1), ticket(2), ticket(3)])
    const state = session()

    await runPass(state)
    await runPass(state)

    const noRoute = mocks.toast.warning.mock.calls.filter(
      (call) => call[0] === 'Auto-start has no repository mapped for these customers.'
    )
    expect(noRoute).toHaveLength(1)
    expect(noRoute[0]?.[1]).toEqual({ description: '#1, #2, #3' })
  })
})

describe('runOdooAutoWorkspacePass — the existing guards', () => {
  it('never re-triggers a ticket that already has a workspace', async () => {
    armFilter()
    armRoute()
    mocks.worktrees = [{ linkedOdooTicket: 1 }]
    mocks.searchOdooTickets.mockResolvedValue([ticket(1)])

    await runPass(session())

    expect(mocks.createWorktree).not.toHaveBeenCalled()
  })

  it('never creates twice for a ticket handled earlier this session', async () => {
    armFilter()
    armRoute()
    mocks.searchOdooTickets.mockResolvedValue([ticket(1)])
    const state = session()

    await runPass(state)
    await runPass(state)

    expect(mocks.createWorktree).toHaveBeenCalledTimes(1)
  })

  it.each([
    [1, '1 more matching ticket was skipped by the per-run limit.'],
    [3, '3 more matching tickets were skipped by the per-run limit.']
  ])('says what the cap dropped (%i)', async (extra, message) => {
    armFilter()
    armRoute()
    mocks.searchOdooTickets.mockResolvedValue(
      Array.from({ length: 1 + extra }, (_unused, index) => ticket(index + 1))
    )

    await runPass(session(), { ...SETTINGS, maxPerRun: 1 })

    expect(mocks.toast.warning).toHaveBeenCalledWith(message)
  })

  it('does not let an unroutable ticket hold a capped slot', async () => {
    armFilter()
    armRoute()
    mocks.searchOdooTickets.mockResolvedValue([
      ticket(1, { customer: undefined, customerCompany: undefined }),
      ticket(2)
    ])

    await runPass(session(), { ...SETTINGS, maxPerRun: 1 })

    expect(mocks.createWorktree).toHaveBeenCalledTimes(1)
    expect(mocks.createWorktree.mock.calls[0]?.[6]).toBe('#2 Ticket 2')
  })
})
