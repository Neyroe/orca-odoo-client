import { describe, expect, it } from 'vitest'
import { parseOdooDomain } from '../../shared/odoo-domain-validation'
import { BASE_DOMAIN, composeDomain } from './ticket-read-domain'

describe('composeDomain', () => {
  it('closes each fragment in its own AND group', () => {
    expect(
      composeDomain(BASE_DOMAIN, ['|', ['id', '=', 1], ['id', '=', 2]], [['project_id', 'in', [7]]])
    ).toEqual([
      '&',
      ['has_template_ancestor', '=', false],
      ['has_project_template', '=', false],
      '|',
      ['id', '=', 1],
      ['id', '=', 2],
      ['project_id', 'in', [7]]
    ])
  })

  it('keeps BASE_DOMAIN out of reach whatever order the fragments come in', () => {
    // The guarantee has to be structural, not a property of putting BASE_DOMAIN
    // first: a template exclusion swallowed by a user '|' puts template tasks
    // back in the list.
    const composed = composeDomain(['|', ['id', '=', 1], ['id', '=', 2]], BASE_DOMAIN)

    expect(composed).toEqual([
      '|',
      ['id', '=', 1],
      ['id', '=', 2],
      '&',
      ['has_template_ancestor', '=', false],
      ['has_project_template', '=', false]
    ])
    // Two operands, ANDed: the OR ends before the first template leaf.
    expect(parseOdooDomain(composed)).toMatchObject({ ok: true, operandCount: 2 })
  })

  it('cannot let a dangling user operator turn a template exclusion into an OR branch', () => {
    const userDomain = ['|', ['name', 'ilike', 'x']]

    // What a flat splice does: the domain parses *clean*, but the '|' has adopted
    // the first template exclusion, so template tasks now satisfy the read.
    const spliced = [...userDomain, ...BASE_DOMAIN]
    expect(parseOdooDomain(spliced)).toMatchObject({ ok: true, operandCount: 2 })
    expect(spliced[2]).toEqual(['has_template_ancestor', '=', false])

    expect(() => composeDomain(userDomain, BASE_DOMAIN)).toThrow(
      'The "|" operator at position 0 is missing an operand.'
    )
  })

  it('refuses to compose an unbalanced fragment at all', () => {
    expect(() => composeDomain(BASE_DOMAIN, ['|', ['id', '=', 1]], [])).toThrow(
      'The "|" operator at position 0 is missing an operand.'
    )
  })

  it('drops empty fragments instead of emitting a hole', () => {
    expect(composeDomain([], [['id', '=', 1]], [])).toEqual([['id', '=', 1]])
    expect(composeDomain([], [], [])).toEqual([])
  })
})
