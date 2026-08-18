import { describe, expect, it } from 'vitest'
import { buildOdooTicketTaskPageRequest } from './worktree-card-odoo-ticket-request'

describe('buildOdooTicketTaskPageRequest', () => {
  it('carries the ticket id and its instance', () => {
    expect(
      buildOdooTicketTaskPageRequest({
        linkedOdooTicket: 45441,
        linkedOdooInstanceId: 'instance-1'
      })
    ).toEqual({ id: 45441, instanceId: 'instance-1' })
  })

  it('omits the instance when the workspace has none', () => {
    expect(
      buildOdooTicketTaskPageRequest({ linkedOdooTicket: 45441, linkedOdooInstanceId: null })
    ).toEqual({ id: 45441 })
    expect(
      buildOdooTicketTaskPageRequest({ linkedOdooTicket: 45441, linkedOdooInstanceId: '  ' })
    ).toEqual({ id: 45441 })
  })

  it('returns null when no ticket is linked', () => {
    expect(
      buildOdooTicketTaskPageRequest({ linkedOdooTicket: null, linkedOdooInstanceId: 'instance-1' })
    ).toBeNull()
    expect(buildOdooTicketTaskPageRequest({})).toBeNull()
  })

  it('rejects ids that cannot address a ticket', () => {
    for (const linkedOdooTicket of [0, -1, 1.5]) {
      expect(buildOdooTicketTaskPageRequest({ linkedOdooTicket })).toBeNull()
    }
  })
})
