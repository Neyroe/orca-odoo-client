import { describe, expect, it } from 'vitest'

import {
  formatOdooRawDomain,
  formatOdooRawDomainBlock,
  parseOdooRawDomainText
} from './odoo-raw-domain-text'

describe('formatOdooRawDomain', () => {
  it('serialises a stored domain in Odoo notation, and answers empty text for none', () => {
    expect(formatOdooRawDomain([['s_raf', '>', 0]])).toBe("[('s_raf', '>', 0)]")
    expect(formatOdooRawDomain(null)).toBe('')
    expect(formatOdooRawDomain([])).toBe('')
  })
})

describe('formatOdooRawDomainBlock', () => {
  it('spreads the same domain over lines, and answers empty text for none', () => {
    expect(
      formatOdooRawDomainBlock([
        ['stage_id', '=', 103],
        ['s_raf', '>', 0]
      ])
    ).toBe("[\n  ('stage_id', '=', 103),\n  ('s_raf', '>', 0)\n]")
    expect(formatOdooRawDomainBlock(null)).toBe('')
    expect(formatOdooRawDomainBlock([])).toBe('')
  })
})

describe('parseOdooRawDomainText', () => {
  it('reads the notation the user copies out of Odoo', () => {
    expect(parseOdooRawDomainText(" [('s_raf', '>', 0)] ")).toEqual({
      ok: true,
      domain: [['s_raf', '>', 0]]
    })
  })

  it('still reads the JSON already stored in saved filters', () => {
    expect(parseOdooRawDomainText(' [["s_raf", ">", 0]] ')).toEqual({
      ok: true,
      domain: [['s_raf', '>', 0]]
    })
  })

  it('reads a domain written over several lines', () => {
    expect(parseOdooRawDomainText("[\n  ('stage_id', '=', 103),\n  ('s_raf', '>', 0),\n]")).toEqual(
      {
        ok: true,
        domain: [
          ['stage_id', '=', 103],
          ['s_raf', '>', 0]
        ]
      }
    )
  })

  it('answers no domain for blank text and for the match-everything domain', () => {
    expect(parseOdooRawDomainText('')).toEqual({ ok: true, domain: null })
    expect(parseOdooRawDomainText('   ')).toEqual({ ok: true, domain: null })
    expect(parseOdooRawDomainText('[]')).toEqual({ ok: true, domain: null })
  })

  it('situates a syntax problem the domain layer never sees', () => {
    expect(parseOdooRawDomainText("[('s_raf', '>', 0)")).toEqual({
      ok: false,
      error: 'The "[" opened at character 1 is never closed.'
    })
    expect(parseOdooRawDomainText("[('s_raf', '>', 'x)]")).toEqual({
      ok: false,
      error: 'The quote opened at character 17 is never closed.'
    })
  })

  it("repeats the shared validator's message verbatim", () => {
    // The main process refuses the same domain in these same words; rewording
    // here would make one refusal read as two different problems.
    expect(parseOdooRawDomainText("['&', ('s_raf', '>', 0)]")).toEqual({
      ok: false,
      error: 'The "&" operator at position 0 is missing an operand.'
    })
    expect(parseOdooRawDomainText("[('s_raf', '~=', 0)]")).toEqual({
      ok: false,
      error: 'The condition at position 0 uses an unknown operator "~=".'
    })
    expect(parseOdooRawDomainText("[('user_ids', 'in', ['$orca:you'])]")).toEqual({
      ok: false,
      error: 'The condition at position 0 uses an unknown Orca token "$orca:you".'
    })
    expect(parseOdooRawDomainText("('s_raf', '>', 0)")).toEqual({
      ok: false,
      error: 'Position 0 is neither a condition nor one of "&", "|", "!".'
    })
  })
})
