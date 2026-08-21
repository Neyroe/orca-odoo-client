// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOdooPanelTicketRequest } from './use-odoo-panel-ticket-request'
import type { OdooTicket } from '../../../shared/odoo-types'
import type { WorktreeNavHistoryEntry } from '@/store/slices/worktree-nav-history'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ticket = { id: 45514, ref: '#45514', instanceId: 'prod' } as OdooTicket

const mocks = vi.hoisted(() => ({ closeTaskPage: vi.fn() }))

const storeState = {
  taskPageData: {} as { openOdooTicket?: OdooTicket },
  worktreeNavHistory: [] as WorktreeNavHistoryEntry[],
  worktreeNavHistoryIndex: -1,
  closeTaskPage: mocks.closeTaskPage
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    {
      getState: () => storeState,
      setState: (updater: (state: typeof storeState) => Partial<typeof storeState>) =>
        Object.assign(storeState, updater(storeState))
    }
  )
}))

let container: HTMLDivElement
let root: Root
let closeTicket: () => void

function Harness({ onSelect }: { onSelect: (ticket: OdooTicket | null) => void }): null {
  closeTicket = useOdooPanelTicketRequest(storeState.taskPageData.openOdooTicket ?? null, onSelect)
  return null
}

beforeEach(() => {
  mocks.closeTaskPage.mockReset()
  storeState.taskPageData = {}
  storeState.worktreeNavHistory = []
  storeState.worktreeNavHistoryIndex = -1
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(onSelect: (ticket: OdooTicket | null) => void): Promise<void> {
  await act(async () => root.render(<Harness onSelect={onSelect} />))
}

describe('useOdooPanelTicketRequest', () => {
  it('opens the ticket a workspace asked for, list read or not', async () => {
    storeState.taskPageData = { openOdooTicket: ticket }
    const onSelect = vi.fn()
    await render(onSelect)

    expect(onSelect).toHaveBeenCalledWith(ticket)
    // Regression: consuming the request here lost the ticket, because TaskPage
    // remounts the panel right after the navigation.
    expect(storeState.taskPageData.openOdooTicket).toBe(ticket)
  })

  it('opens a ticket requested while the panel is already on screen', async () => {
    const onSelect = vi.fn()
    await render(onSelect)
    expect(onSelect).not.toHaveBeenCalled()

    storeState.taskPageData = { openOdooTicket: ticket }
    await render(onSelect)

    expect(onSelect).toHaveBeenCalledWith(ticket)
  })

  it('opens nothing when no workspace asked for a ticket', async () => {
    const onSelect = vi.fn()
    await render(onSelect)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('returns to the requesting workspace on close', async () => {
    storeState.taskPageData = { openOdooTicket: ticket }
    storeState.worktreeNavHistory = ['a', { kind: 'task-detail', source: 'odoo', ticket }]
    storeState.worktreeNavHistoryIndex = 1
    const onSelect = vi.fn()
    await render(onSelect)

    await act(async () => closeTicket())

    expect(onSelect).toHaveBeenLastCalledWith(null)
    // closeTaskPage, not one step back: the Tasks visit and the ticket detail are
    // two history entries, so a single step back only reaches the list.
    expect(mocks.closeTaskPage).toHaveBeenCalledTimes(1)
    expect(storeState.taskPageData.openOdooTicket).toBeUndefined()
  })

  it('stays on the list when there is no workspace to return to', async () => {
    storeState.taskPageData = { openOdooTicket: ticket }
    storeState.worktreeNavHistory = [{ kind: 'task-detail', source: 'odoo', ticket }]
    storeState.worktreeNavHistoryIndex = 0
    const onSelect = vi.fn()
    await render(onSelect)

    await act(async () => closeTicket())

    expect(mocks.closeTaskPage).not.toHaveBeenCalled()
  })

  it('stays on the list when closing a ticket picked from the list', async () => {
    storeState.worktreeNavHistory = ['a', { kind: 'task-detail', source: 'odoo', ticket }]
    storeState.worktreeNavHistoryIndex = 1
    const onSelect = vi.fn()
    await render(onSelect)

    await act(async () => closeTicket())

    expect(mocks.closeTaskPage).not.toHaveBeenCalled()
  })
})
