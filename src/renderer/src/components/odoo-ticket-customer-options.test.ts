import { describe, expect, it } from 'vitest'

import { deriveOdooCustomerOptions } from './odoo-ticket-customer-options'

const ticket = (
  instanceId: string | undefined,
  company: { id: number; name: string } | undefined
): { instanceId?: string; customerCompany?: { id: number; name: string } } => ({
  ...(instanceId ? { instanceId } : {}),
  ...(company ? { customerCompany: company } : {})
})

describe('deriveOdooCustomerOptions', () => {
  it('keys a company by instance, so two databases never share a row', () => {
    const options = deriveOdooCustomerOptions([
      ticket('inst-a', { id: 1633, name: 'CAM - NOVACEL' }),
      ticket('inst-b', { id: 1633, name: 'Other Co' })
    ])

    expect(options.map((option) => option.value)).toEqual(['inst-a:1633', 'inst-b:1633'])
  })

  it('keeps one row per company and sorts by label', () => {
    const options = deriveOdooCustomerOptions([
      ticket('inst-a', { id: 46951, name: 'NUTRIPURE' }),
      ticket('inst-a', { id: 1633, name: 'CAM - NOVACEL' }),
      ticket('inst-a', { id: 46951, name: 'NUTRIPURE' })
    ])

    expect(options).toEqual([
      { value: 'inst-a:1633', label: 'CAM - NOVACEL' },
      { value: 'inst-a:46951', label: 'NUTRIPURE' }
    ])
  })

  it('skips a ticket with no company rather than offering an unkeyable row', () => {
    // Planning tasks carry no customer at all; that is normal, not an error.
    expect(deriveOdooCustomerOptions([ticket('inst-a', undefined)])).toEqual([])
  })

  it('skips a company whose instance is unknown', () => {
    // Without the instance the key would collide across databases.
    expect(deriveOdooCustomerOptions([ticket(undefined, { id: 1633, name: 'CAM' })])).toEqual([])
  })
})
