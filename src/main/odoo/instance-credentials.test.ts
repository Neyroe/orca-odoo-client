import { describe, expect, it, vi } from 'vitest'
import { normalizeOdooServerUrl, OdooServerUrlError } from './instance-credentials'

// The module reaches for safeStorage at call time only; this satisfies the import.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => ''
  }
}))

describe('normalizeOdooServerUrl', () => {
  it('defaults to http for a bare host and strips trailing path noise', () => {
    expect(normalizeOdooServerUrl(' odoo.local:8069/ ')).toBe('http://odoo.local:8069')
    expect(normalizeOdooServerUrl('https://acme.odoo.com/odoo/?db=x#frag')).toBe(
      'https://acme.odoo.com/odoo'
    )
  })

  it('rejects a URL carrying userinfo, which would be persisted in cleartext', () => {
    // `url.toString()` keeps `user:password@`, and the instance file is not encrypted.
    expect(() => normalizeOdooServerUrl('https://user:secret@acme.odoo.com')).toThrow(
      OdooServerUrlError
    )
    expect(() => normalizeOdooServerUrl('https://user@acme.odoo.com')).toThrow(OdooServerUrlError)
    expect(() => normalizeOdooServerUrl('acme.odoo.com:8069')).not.toThrow()
  })
})
