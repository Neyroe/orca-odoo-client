// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OdooTicket } from '../../../shared/odoo-types'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback,
  i18n: { language: 'en' }
}))

vi.mock('@/components/use-odoo-projects', () => ({
  useOdooProjects: () => ({ projects: [], loading: false, failed: false })
}))

vi.mock('@/components/odoo-ticket-workspace', () => ({
  OdooTicketWorkspace: (): null => null
}))

vi.mock('@/components/odoo-auto-workspace-dialog', () => ({
  OdooAutoWorkspaceDialog: (): null => null
}))

const storeState = {
  odooStatus: { connected: true, viewer: null } as {
    connected: boolean
    viewer: null
    instances?: unknown[]
    activeInstanceId?: string | null
    selectedInstanceId?: string | null
    credentialError?: string
  },
  odooStatusChecked: true,
  // The panel reads this unconditionally through useOdooPanelTicketRequest, so
  // the parent object has to exist even when no ticket was requested.
  taskPageData: {} as { openOdooTicket?: OdooTicket },
  checkOdooConnection: vi.fn().mockResolvedValue(undefined),
  // The panel compiles its filters into a domain, so every read is a search now.
  searchOdooTickets: vi.fn(),
  selectOdooInstance: vi.fn().mockResolvedValue(undefined)
}

vi.mock('@/store', () => {
  const useAppStore = Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
  return { useAppStore }
})

import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskPageOdooPanel } from './task-page-odoo-panel'

// Same project.task id, minted by two different Odoo databases.
const DUPLICATE_ID = 45514
function ticketFixture(overrides: Partial<OdooTicket>): OdooTicket {
  return {
    id: DUPLICATE_ID,
    ref: '#45514',
    title: 'Untitled',
    url: 'https://example.test/task/45514',
    state: '01_in_progress',
    priority: '1',
    tags: [],
    assignees: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

const prodTicket = ticketFixture({ title: 'Prod ticket', instanceId: 'prod' })
const stagingTicket = ticketFixture({ title: 'Staging ticket', instanceId: 'staging' })

describe('TaskPageOdooPanel ticket selection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Leaking a request into the next test would pre-select its ticket and let a
    // click assertion pass without the click.
    storeState.taskPageData = {}
    storeState.searchOdooTickets.mockResolvedValue([prodTicket, stagingTicket])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('highlights only the opened ticket in list and kanban views, even when another instance shares its id', async () => {
    window.localStorage.setItem('odoo.ticketPanelView', 'list')
    render(
      <TooltipProvider>
        <TaskPageOdooPanel />
      </TooltipProvider>
    )

    const prodRow = await screen.findByText('Prod ticket')
    const stagingRow = await screen.findByText('Staging ticket')

    fireEvent.click(prodRow)

    await waitFor(() => {
      expect(prodRow.closest('[role="button"]')).toHaveAttribute('aria-current', 'true')
    })
    expect(stagingRow.closest('[role="button"]')).not.toHaveAttribute('aria-current', 'true')

    fireEvent.click(screen.getByLabelText('Kanban'))

    const prodCard = await screen.findByText('Prod ticket')
    const stagingCard = await screen.findByText('Staging ticket')
    expect(prodCard.closest('button')).toHaveAttribute('aria-current', 'true')
    expect(stagingCard.closest('button')).not.toHaveAttribute('aria-current', 'true')
  })

  it('opens the ticket a workspace requested, not its id twin on another instance', async () => {
    window.localStorage.setItem('odoo.ticketPanelView', 'list')
    // A distinct object, like the workspace hands over: matching is on id + instance.
    storeState.taskPageData = {
      openOdooTicket: ticketFixture({ title: 'Prod ticket', instanceId: 'prod' })
    }
    render(
      <TooltipProvider>
        <TaskPageOdooPanel />
      </TooltipProvider>
    )

    // No click: the request alone must open the ticket, once the list has loaded.
    const prodRow = await screen.findByText('Prod ticket')
    await waitFor(() => {
      expect(prodRow.closest('[role="button"]')).toHaveAttribute('aria-current', 'true')
    })
    expect(screen.getByText('Staging ticket').closest('[role="button"]')).not.toHaveAttribute(
      'aria-current',
      'true'
    )
  })
})
