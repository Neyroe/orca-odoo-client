import { describe, expect, it } from 'vitest'
import type { OdooConnectionStatus, OdooInstance } from '../../../../shared/odoo-types'
import { rejectedOdooCredential } from './odoo-read-coordination'

function instance(overrides: Partial<OdooInstance> = {}): OdooInstance {
  return {
    id: 'inst-1',
    serverUrl: 'https://odoo.example.test',
    database: 'prod',
    login: 'dev@example.test',
    uid: 7,
    displayName: 'Prod',
    ...overrides
  }
}

const connected = (instances: OdooInstance[], selected?: string): OdooConnectionStatus => ({
  connected: true,
  viewer: null,
  instances,
  selectedInstanceId: selected
})

describe('rejectedOdooCredential', () => {
  it('snapshots the instance the failing read named', () => {
    expect(rejectedOdooCredential(connected([instance()]), 'inst-1')).toEqual({
      id: 'inst-1',
      serverUrl: 'https://odoo.example.test',
      database: 'prod',
      login: 'dev@example.test'
    })
  })

  it('falls back to the selected instance when the read did not name one', () => {
    const status = connected(
      [instance(), instance({ id: 'inst-2', database: 'staging' })],
      'inst-2'
    )
    expect(rejectedOdooCredential(status, null)?.database).toBe('staging')
  })

  it('blames nobody for an all-instances read', () => {
    // One rejected key fails the whole fan-out, so naming an instance here
    // would mislabel a healthy one.
    expect(rejectedOdooCredential(connected([instance()], 'all'), 'all')).toBeNull()
    expect(rejectedOdooCredential(connected([instance()], 'all'), null)).toBeNull()
  })

  it('returns null when the instance is not in the status', () => {
    expect(rejectedOdooCredential(connected([instance()]), 'inst-9')).toBeNull()
    expect(rejectedOdooCredential({ connected: false, viewer: null }, 'inst-1')).toBeNull()
  })
})
