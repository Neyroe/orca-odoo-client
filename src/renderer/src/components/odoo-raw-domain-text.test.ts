import { describe, expect, it } from 'vitest'

import { formatOdooRawDomain, parseOdooRawDomainText } from './odoo-raw-domain-text'

describe('formatOdooRawDomain', () => {
  it('serialises a stored domain, and answers empty text for none', () => {
    expect(formatOdooRawDomain([['s_raf', '>', 0]])).toBe('[["s_raf",">",0]]')
    expect(formatOdooRawDomain(null)).toBe('')
    expect(formatOdooRawDomain([])).toBe('')
  })
})

describe('parseOdooRawDomainText', () => {
  it('reads a domain filtering on a field Orca never fetches', () => {
    expect(parseOdooRawDomainText(' [["s_raf", ">", 0]] ')).toEqual({
      ok: true,
      domain: [['s_raf', '>', 0]]
    })
  })

  it('answers no domain for blank text and for the match-everything domain', () => {
    expect(parseOdooRawDomainText('')).toEqual({ ok: true, domain: null })
    expect(parseOdooRawDomainText('   ')).toEqual({ ok: true, domain: null })
    expect(parseOdooRawDomainText('[]')).toEqual({ ok: true, domain: null })
  })

  it('names the JSON syntax, which the shared validator never sees', () => {
    expect(parseOdooRawDomainText('[["s_raf", ">", 0]')).toEqual({
      ok: false,
      error: 'Write the domain as JSON, like [["s_raf", ">", 0]].'
    })
  })

  it("repeats the shared validator's message verbatim", () => {
    // The main process refuses the same domain in these same words; rewording
    // here would make one refusal read as two different problems.
    expect(parseOdooRawDomainText('["&", ["s_raf", ">", 0]]')).toEqual({
      ok: false,
      error: 'The "&" operator at position 0 is missing an operand.'
    })
    expect(parseOdooRawDomainText('[["s_raf", "~=", 0]]')).toEqual({
      ok: false,
      error: 'The condition at position 0 uses an unknown operator "~=".'
    })
    expect(parseOdooRawDomainText('[["user_ids", "in", ["$orca:you"]]]')).toEqual({
      ok: false,
      error: 'The condition at position 0 uses an unknown Orca token "$orca:you".'
    })
    expect(parseOdooRawDomainText('{"s_raf": 0}')).toEqual({
      ok: false,
      error: 'A domain must be a list of conditions.'
    })
  })
})
