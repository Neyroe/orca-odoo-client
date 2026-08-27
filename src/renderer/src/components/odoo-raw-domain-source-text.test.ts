// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_ODOO_RAW_DOMAIN_SOURCE_TEXTS,
  parseOdooRawDomainSourceTexts,
  readOdooRawDomainSourceText,
  rememberOdooRawDomainSourceText
} from './odoo-raw-domain-source-text'
import type { OdooDomain } from '../../../shared/odoo-types'

const RAF: OdooDomain = [['s_raf', '>', 0]]
const TYPED = "[\n  ('s_raf', '>', 0),\n]"

beforeEach(() => {
  window.localStorage.clear()
})

describe('rememberOdooRawDomainSourceText', () => {
  it('hands back the formatting the user typed, not a re-serialized one', () => {
    rememberOdooRawDomainSourceText(RAF, TYPED)

    expect(readOdooRawDomainSourceText(RAF)).toBe(TYPED)
  })

  it('answers nothing for a domain written before the text was remembered', () => {
    // A filter saved by an older build, a preset chip, another machine: the
    // caller pretty-prints instead, which is the same answer this would give.
    expect(readOdooRawDomainSourceText(RAF)).toBeNull()
  })

  it('keys on the domain, so two spellings of one domain share a text', () => {
    rememberOdooRawDomainSourceText(RAF, TYPED)

    expect(readOdooRawDomainSourceText([['s_raf', '>', 0]])).toBe(TYPED)
  })

  it('tells two domains apart', () => {
    rememberOdooRawDomainSourceText(RAF, TYPED)

    expect(readOdooRawDomainSourceText([['s_done', '=', false]])).toBeNull()
  })

  it('replaces the text of a domain rather than piling up entries for it', () => {
    rememberOdooRawDomainSourceText(RAF, TYPED)
    rememberOdooRawDomainSourceText(RAF, "[('s_raf', '>', 0)]")

    expect(readOdooRawDomainSourceText(RAF)).toBe("[('s_raf', '>', 0)]")
    expect(
      parseOdooRawDomainSourceTexts(window.localStorage.getItem('odoo.rawDomainSourceText'))
    ).toHaveLength(1)
  })

  it('remembers nothing for a domain that is not one', () => {
    rememberOdooRawDomainSourceText(null, TYPED)
    rememberOdooRawDomainSourceText([], TYPED)

    expect(window.localStorage.getItem('odoo.rawDomainSourceText')).toBeNull()
    expect(readOdooRawDomainSourceText(null)).toBeNull()
  })

  it('evicts the oldest text once the cap is reached', () => {
    for (let index = 0; index <= MAX_ODOO_RAW_DOMAIN_SOURCE_TEXTS; index += 1) {
      rememberOdooRawDomainSourceText([['s_raf', '>', index]], `typed ${index}`)
    }

    expect(readOdooRawDomainSourceText([['s_raf', '>', 0]])).toBeNull()
    expect(readOdooRawDomainSourceText([['s_raf', '>', 1]])).toBe('typed 1')
    expect(readOdooRawDomainSourceText([['s_raf', '>', MAX_ODOO_RAW_DOMAIN_SOURCE_TEXTS]])).toBe(
      `typed ${MAX_ODOO_RAW_DOMAIN_SOURCE_TEXTS}`
    )
  })

  it('survives storage that is disabled or over quota', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => rememberOdooRawDomainSourceText(RAF, TYPED)).not.toThrow()
    expect(readOdooRawDomainSourceText(RAF)).toBeNull()

    setItem.mockRestore()
    getItem.mockRestore()
  })
})

describe('parseOdooRawDomainSourceTexts', () => {
  it('drops an unreadable pair instead of keeping it', () => {
    expect(parseOdooRawDomainSourceTexts(null)).toEqual([])
    expect(parseOdooRawDomainSourceTexts('not json')).toEqual([])
    expect(parseOdooRawDomainSourceTexts('{"a": 1}')).toEqual([])
    expect(parseOdooRawDomainSourceTexts('[["key", "text"], ["key"], 7, ["k", 2]]')).toEqual([
      ['key', 'text']
    ])
  })
})
