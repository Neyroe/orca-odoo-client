import { describe, expect, it } from 'vitest'

import { formatOdooDomainLiteral, formatOdooDomainLiteralBlock } from './odoo-domain-literal-format'
import { parseOdooDomainLiteral } from './odoo-domain-literal-parse'

const ROUND_TRIP: readonly unknown[][] = [
  [],
  [['s_raf', '>', 0]],
  [
    ['stage_id', '=', 103],
    ['s_raf', '>', 0]
  ],
  ['|', ['user_ids', 'in', ['$orca:me', 180]], ['user_ids', '=', false]],
  ['!', ['s_done', '=', true]],
  [['partner_id', '=', null]],
  [['amount', '<', -0.25]],
  [['tag_ids', 'in', [1, 2, 3]]],
  [['x', 'any', [['y', '=', 1]]]],
  [['name', 'ilike', "O'Brien"]],
  [['name', 'ilike', 'say "hi"']],
  [['path', '=', 'C:\\tmp']],
  [['note', 'ilike', 'one\ntwo\tthree']]
]

describe('formatOdooDomainLiteral', () => {
  it('writes the notation Odoo writes: tuples for conditions, single quotes', () => {
    expect(formatOdooDomainLiteral([['s_raf', '>', 0]])).toBe("[('s_raf', '>', 0)]")
    expect(
      formatOdooDomainLiteral(['|', ['user_ids', 'in', [180]], ['user_ids', '=', false]])
    ).toBe("['|', ('user_ids', 'in', [180]), ('user_ids', '=', False)]")
  })

  it('keeps a value list a list, since only a condition is a tuple', () => {
    expect(formatOdooDomainLiteral([['tag_ids', 'in', [1, 2]]])).toBe("[('tag_ids', 'in', [1, 2])]")
    expect(formatOdooDomainLiteral([['x', 'any', [['y', '=', 1]]]])).toBe(
      "[('x', 'any', [('y', '=', 1)])]"
    )
  })

  it('writes the Python literals for the three non-numbers', () => {
    expect(formatOdooDomainLiteral([['a', '=', true]])).toBe("[('a', '=', True)]")
    expect(formatOdooDomainLiteral([['a', '=', false]])).toBe("[('a', '=', False)]")
    expect(formatOdooDomainLiteral([['a', '=', null]])).toBe("[('a', '=', None)]")
  })

  it('shows the current-user token as itself — the editor exists to make it visible', () => {
    expect(formatOdooDomainLiteral([['user_ids', 'in', ['$orca:me']]])).toBe(
      "[('user_ids', 'in', ['$orca:me'])]"
    )
  })

  it('escapes what would otherwise close the quote or eat a backslash', () => {
    expect(formatOdooDomainLiteral([['a', '=', "O'Brien"]])).toBe(
      String.raw`[('a', '=', 'O\'Brien')]`
    )
    expect(formatOdooDomainLiteral([['a', '=', 'C:\\tmp']])).toBe(
      String.raw`[('a', '=', 'C:\\tmp')]`
    )
    expect(formatOdooDomainLiteral([['a', '=', 'one\ntwo']])).toBe(
      String.raw`[('a', '=', 'one\ntwo')]`
    )
  })

  it('leaves a double quote alone, since the output is single-quoted', () => {
    expect(formatOdooDomainLiteral([['a', '=', 'say "hi"']])).toBe(`[('a', '=', 'say "hi"')]`)
  })

  it('stays on one line, for the toolbar box', () => {
    expect(formatOdooDomainLiteral(ROUND_TRIP[2] ?? [])).not.toContain('\n')
  })
})

describe('formatOdooDomainLiteralBlock', () => {
  it('puts one condition per line, so a long domain shows its shape', () => {
    expect(
      formatOdooDomainLiteralBlock([
        ['stage_id', '=', 103],
        ['s_raf', '>', 0]
      ])
    ).toBe("[\n  ('stage_id', '=', 103),\n  ('s_raf', '>', 0)\n]")
  })

  it('keeps a prefix operator on its own line, where it reads as the operator it is', () => {
    expect(formatOdooDomainLiteralBlock(['|', ['a', '=', 1], ['b', '=', 2]])).toBe(
      "[\n  '|',\n  ('a', '=', 1),\n  ('b', '=', 2)\n]"
    )
  })

  it('writes the match-everything domain as itself', () => {
    expect(formatOdooDomainLiteralBlock([])).toBe('[]')
  })
})

describe('the two layers together', () => {
  it.each(ROUND_TRIP.map((domain) => [JSON.stringify(domain), domain] as const))(
    'reads back %s unchanged',
    (_label, domain) => {
      expect(parseOdooDomainLiteral(formatOdooDomainLiteral(domain))).toEqual({
        ok: true,
        value: domain
      })
      expect(parseOdooDomainLiteral(formatOdooDomainLiteralBlock(domain))).toEqual({
        ok: true,
        value: domain
      })
    }
  )
})
