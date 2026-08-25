import { describe, expect, it } from 'vitest'
import {
  CURRENT_USER_TOKEN,
  domainUsesOrcaToken,
  isOrcaTokenNamespace,
  resolveCurrentUserToken
} from './odoo-domain-tokens'

describe('resolveCurrentUserToken', () => {
  it('resolves the same domain to a different uid per instance', () => {
    // The reason the token exists: one stored filter, two databases, two uids.
    const stored = [['user_ids', 'in', [CURRENT_USER_TOKEN]]]

    expect(resolveCurrentUserToken(stored, 7)).toEqual([['user_ids', 'in', [7]]])
    expect(resolveCurrentUserToken(stored, 180)).toEqual([['user_ids', 'in', [180]]])
  })

  it('resolves a scalar value and a value nested in a subdomain', () => {
    expect(resolveCurrentUserToken([['create_uid', '=', CURRENT_USER_TOKEN]], 7)).toEqual([
      ['create_uid', '=', 7]
    ])
    expect(
      resolveCurrentUserToken([['message_ids', 'any', [['author_id', '=', CURRENT_USER_TOKEN]]]], 7)
    ).toEqual([['message_ids', 'any', [['author_id', '=', 7]]]])
  })

  it('leaves operators, field names and other values untouched', () => {
    const domain = ['|', ['name', 'ilike', '@me'], ['user_ids', 'in', [180]]]

    expect(resolveCurrentUserToken(domain, 7)).toEqual(domain)
  })

  it('never rewrites a field name, even one that reads as the token', () => {
    // Validation refuses this shape; the resolver must not "fix" it into a read
    // of a different field either.
    expect(resolveCurrentUserToken([[CURRENT_USER_TOKEN, '=', 1]], 7)).toEqual([
      [CURRENT_USER_TOKEN, '=', 1]
    ])
  })

  it('does not mutate the stored domain it was given', () => {
    const stored = [['user_ids', 'in', [CURRENT_USER_TOKEN]]]

    resolveCurrentUserToken(stored, 7)

    expect(stored).toEqual([['user_ids', 'in', [CURRENT_USER_TOKEN]]])
  })
})

describe('isOrcaTokenNamespace', () => {
  it('claims the reserved prefix and nothing else', () => {
    expect(isOrcaTokenNamespace(CURRENT_USER_TOKEN)).toBe(true)
    expect(isOrcaTokenNamespace('$orca:whatever')).toBe(true)
    expect(isOrcaTokenNamespace('@me')).toBe(false)
    expect(isOrcaTokenNamespace('orca:me')).toBe(false)
    expect(isOrcaTokenNamespace(180)).toBe(false)
  })
})

describe('domainUsesOrcaToken', () => {
  it('finds a token wherever a value can hold one', () => {
    expect(domainUsesOrcaToken([['user_ids', 'in', [CURRENT_USER_TOKEN]]])).toBe(true)
    expect(domainUsesOrcaToken([['create_uid', '=', CURRENT_USER_TOKEN]])).toBe(true)
    expect(
      domainUsesOrcaToken([
        '|',
        ['id', '=', 1],
        ['message_ids', 'any', [['author_id', '=', CURRENT_USER_TOKEN]]]
      ])
    ).toBe(true)
  })

  it('answers for the whole namespace, not just the tokens this build knows', () => {
    // A host that cannot resolve `$orca:` cannot resolve a token added later
    // either, so the negotiation must trip on both.
    expect(domainUsesOrcaToken([['id', '=', '$orca:future']])).toBe(true)
  })

  it('says no for a domain a host of any age can read', () => {
    expect(domainUsesOrcaToken([])).toBe(false)
    expect(domainUsesOrcaToken(['|', ['name', 'ilike', '@me'], ['user_ids', 'in', [180]]])).toBe(
      false
    )
    expect(domainUsesOrcaToken([['name', 'ilike', 'orca:me']])).toBe(false)
  })
})
