import { describe, expect, it } from 'vitest'

import { parseOdooDomainLiteral } from './odoo-domain-literal-parse'

function value(text: string): unknown {
  const parsed = parseOdooDomainLiteral(text)
  if (!parsed.ok) {
    throw new Error(`expected ${text} to parse, got: ${parsed.error}`)
  }
  return parsed.value
}

function error(text: string): string {
  const parsed = parseOdooDomainLiteral(text)
  if (parsed.ok) {
    throw new Error(`expected ${text} to be refused, got ${JSON.stringify(parsed.value)}`)
  }
  return parsed.error
}

describe('parseOdooDomainLiteral', () => {
  it('reads the Python literal Odoo prints', () => {
    expect(value("[('stage_id', '=', 103), ('s_raf', '>', 0)]")).toEqual([
      ['stage_id', '=', 103],
      ['s_raf', '>', 0]
    ])
  })

  it('reads the JSON older builds stored, so a stored domain still opens', () => {
    expect(value('[["s_raf", ">", 0]]')).toEqual([['s_raf', '>', 0]])
  })

  it('reads prefix operators as top-level elements', () => {
    expect(value("['|', ('user_ids', 'in', [180]), ('user_ids', '=', False)]")).toEqual([
      '|',
      ['user_ids', 'in', [180]],
      ['user_ids', '=', false]
    ])
    expect(value("['!', ('s_done', '=', True)]")).toEqual(['!', ['s_done', '=', true]])
    expect(value("['&', ('a', '=', 1), ('b', '=', 2)]")).toEqual([
      '&',
      ['a', '=', 1],
      ['b', '=', 2]
    ])
  })

  it.each([
    ['single quotes', "[('a', '=', 'x')]", [['a', '=', 'x']]],
    ['double quotes', '[("a", "=", "x")]', [['a', '=', 'x']]],
    ['mixed quotes', `[('a', "=", 'x')]`, [['a', '=', 'x']]],
    ['tuples', "[('a', '=', 1)]", [['a', '=', 1]]],
    ['lists', "[['a', '=', 1]]", [['a', '=', 1]]],
    ['True', "[('a', '=', True)]", [['a', '=', true]]],
    ['False', "[('a', '=', False)]", [['a', '=', false]]],
    ['None', "[('a', '=', None)]", [['a', '=', null]]],
    ['JSON booleans', '[("a", "=", false)]', [['a', '=', false]]],
    ['JSON null', '[("a", "=", null)]', [['a', '=', null]]],
    ['integers', "[('a', '=', 103)]", [['a', '=', 103]]],
    ['floats', "[('a', '>', 1.5)]", [['a', '>', 1.5]]],
    ['negatives', "[('a', '<', -3)]", [['a', '<', -3]]],
    ['negative floats', "[('a', '<', -0.25)]", [['a', '<', -0.25]]],
    ['explicit positives', "[('a', '=', +7)]", [['a', '=', 7]]],
    ['exponents', "[('a', '<', 1e3)]", [['a', '<', 1000]]],
    ['a trailing comma', "[('a', '=', 1),]", [['a', '=', 1]]],
    ['a trailing comma inside a condition', "[('a', '=', 1,)]", [['a', '=', 1]]],
    ['nested lists for `in`', "[('tag_ids', 'in', [1, 2, 3])]", [['tag_ids', 'in', [1, 2, 3]]]],
    ['an empty list', '[]', []],
    ['an empty nested list', "[('tag_ids', 'in', [])]", [['tag_ids', 'in', []]]],
    [
      'line breaks and indentation',
      "[\n  ('stage_id', '=', 103),\n  ('s_raf', '>', 0),\n]",
      [
        ['stage_id', '=', 103],
        ['s_raf', '>', 0]
      ]
    ],
    ['tabs and padding', "  [\t('a',\t'=',\t1)\t]  ", [['a', '=', 1]]],
    ['a subdomain for `any`', "[('x', 'any', [('y', '=', 1)])]", [['x', 'any', [['y', '=', 1]]]]]
  ])('reads %s', (_label, text, expected) => {
    expect(value(text)).toEqual(expected)
  })

  it.each([
    ['an escaped single quote', String.raw`[('a', '=', 'O\'Brien')]`, "O'Brien"],
    ['an escaped double quote', String.raw`[("a", "=", "say \"hi\"")]`, 'say "hi"'],
    ['an escaped backslash', String.raw`[('a', '=', 'C:\\tmp')]`, 'C:\\tmp'],
    ['an escaped newline', String.raw`[('a', '=', 'one\ntwo')]`, 'one\ntwo'],
    ['a quote of the other kind, unescaped', `[('a', '=', 'say "hi"')]`, 'say "hi"'],
    // Odoo's repr never emits this, so keeping the character beats refusing it.
    ['an unknown escape', String.raw`[('a', '=', 'a\dz')]`, 'adz']
  ])('reads %s', (_label, text, expected) => {
    expect(value(text)).toEqual([['a', '=', expected]])
  })

  it('reads a value that is not a domain, and leaves that judgement to the domain layer', () => {
    // The text layer answers "what does this spell", never "is this a domain".
    expect(value("('a', '=', 1)")).toEqual(['a', '=', 1])
    expect(value('42')).toBe(42)
  })

  it.each([
    ['an unclosed bracket', "[('a', '=', 1)", 'The "[" opened at character 1 is never closed.'],
    [
      'a tuple closed by a bracket',
      "[('a', '=', 1]",
      'The "(" opened at character 2 is closed by "]".'
    ],
    [
      'a nested list closed by a parenthesis',
      "[('a', 'in', [1, 2)]",
      'The "[" opened at character 14 is closed by ")".'
    ],
    [
      'an unclosed single quote',
      "[('a', '=', 'x)]",
      'The quote opened at character 13 is never closed.'
    ],
    [
      'an unclosed double quote',
      '[("a", "=", "x)]',
      'The quote opened at character 13 is never closed.'
    ],
    ['a missing comma', "[('a' '=' 1)]", 'Character 7 should be "," or ")", not "\'".'],
    ['a stray comma', "[,('a', '=', 1)]", 'Character 2 (",") cannot start a value.'],
    ['a mapping', '{"a": 1}', 'Character 1 ("{") cannot start a value.'],
    [
      'a bare word',
      '[(a, "=", 1)]',
      '"a" at character 3 is not a value. Quote it, or write True, False or None.'
    ],
    [
      'a word that is not a literal',
      '[("a", "=", Yes)]',
      '"Yes" at character 13 is not a value. Quote it, or write True, False or None.'
    ],
    ['a lone minus', '[("a", "=", -)]', 'The number at character 13 is incomplete.'],
    [
      'text after the domain',
      "[('a', '=', 1)] junk",
      'The domain ends at character 17; remove what follows it.'
    ],
    ['a condition cut short', "[('a', '=',", 'The "(" opened at character 2 is never closed.'],
    ['empty text', '', 'A value is missing at character 1.']
  ])('refuses %s', (_label, text, expected) => {
    expect(error(text)).toBe(expected)
  })

  it('refuses a domain nested past what any walk over it will follow', () => {
    expect(error(`${'['.repeat(70)}${']'.repeat(70)}`)).toContain('nests too deeply')
  })

  it('never throws and never returns a half-read value', () => {
    for (const text of ["[('a", '[[[', "((('", '"', "[('a', '=', 1)] [", '-', '\\']) {
      const parsed = parseOdooDomainLiteral(text)
      expect(parsed.ok).toBe(false)
      expect(parsed).not.toHaveProperty('value')
    }
  })
})
