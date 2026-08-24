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

vi.mock('@/components/use-odoo-auto-workspace', () => ({
  useOdooAutoWorkspace: () => (): void => {}
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
  checkOdooConnection: vi.fn().mockResolvedValue(undefined),
  listOdooTickets: vi.fn(),
  searchOdooTickets: vi.fn().mockResolvedValue([]),
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
    storeState.listOdooTickets.mockResolvedValue([prodTicket, stagingTicket])
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
})
