import { describe, expect, it } from 'vitest'

import { planOdooPanelTicketClose } from './odoo-panel-ticket-close-plan'
import type { OdooTicket } from '../../../shared/odoo-types'

function ticket(overrides: Partial<OdooTicket> = {}): OdooTicket {
  return { id: 45514, instanceId: 'prod', ...overrides } as OdooTicket
}

const odooEntry = { kind: 'task-detail', source: 'odoo', ticket: ticket() } as const

describe('planOdooPanelTicketClose', () => {
  it('closes in place a ticket the panel opened from its own list', () => {
    expect(
      planOdooPanelTicketClose({
        closing: ticket(),
        requested: null,
        currentEntry: odooEntry,
        historyIndex: 2
      })
    ).toBe('none')
  })

  it('closes in place when the open ticket is not the requested one', () => {
    expect(
      planOdooPanelTicketClose({
        closing: ticket({ id: 45515 }),
        requested: ticket(),
        currentEntry: odooEntry,
        historyIndex: 2
      })
    ).toBe('none')
  })

  it('tells apart same-id tickets from different instances', () => {
    expect(
      planOdooPanelTicketClose({
        closing: ticket({ instanceId: 'staging' }),
        requested: ticket(),
        currentEntry: odooEntry,
        historyIndex: 2
      })
    ).toBe('none')
  })

  it('returns to the requesting workspace', () => {
    expect(
      planOdooPanelTicketClose({
        closing: ticket(),
        requested: ticket(),
        currentEntry: odooEntry,
        historyIndex: 2
      })
    ).toBe('return-to-workspace')
  })

  it('closes in place when there is nowhere to go back to', () => {
    expect(
      planOdooPanelTicketClose({
        closing: ticket(),
        requested: ticket(),
        currentEntry: odooEntry,
        historyIndex: 0
      })
    ).toBe('none')
  })

  it('closes in place when history moved off the ticket detail', () => {
    expect(
      planOdooPanelTicketClose({
        closing: ticket(),
        requested: ticket(),
        currentEntry: 'tasks',
        historyIndex: 3
      })
    ).toBe('none')
  })
})
