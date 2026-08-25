import { describe, expect, it } from 'vitest'

import { OdooCurrentUserTokenUnsupportedError } from '@/runtime/runtime-odoo-client'
import { odooTicketReadErrorMessage } from './odoo-ticket-read-error-message'

describe('odooTicketReadErrorMessage', () => {
  it('blames the outdated host when the current-user token is refused', () => {
    const message = odooTicketReadErrorMessage(new OdooCurrentUserTokenUnsupportedError())

    expect(message).toContain('too old to filter on the signed-in Odoo user')
    // The thrown message names a "remote runtime", which reads as a broken
    // connection — the one thing this failure is not.
    expect(message).not.toContain('remote runtime')
    expect(message).toContain('the connection and the domain are fine')
  })

  it('passes every other failure through in its own words', () => {
    expect(odooTicketReadErrorMessage(new Error('Odoo is unreachable'))).toBe('Odoo is unreachable')
    expect(odooTicketReadErrorMessage('read timed out')).toBe('read timed out')
  })
})
