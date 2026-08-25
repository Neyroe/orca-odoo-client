import { describe, expect, it } from 'vitest'
import { CURRENT_USER_TOKEN } from './odoo-domain-tokens'
import { andGroupedDomain, parseOdooDomain } from './odoo-domain-validation'

function error(value: unknown): string {
  const parsed = parseOdooDomain(value)
  if (parsed.ok) {
    throw new Error(`expected ${JSON.stringify(value)} to be refused`)
  }
  return parsed.error
}

describe('parseOdooDomain', () => {
  it('accepts an empty domain as match-all', () => {
    expect(parseOdooDomain([])).toEqual({ ok: true, domain: [], operandCount: 0 })
  })

  it('accepts a single leaf', () => {
    const domain = [['name', 'ilike', 'invoice']]
    expect(parseOdooDomain(domain)).toEqual({ ok: true, domain, operandCount: 1 })
  })

  it('counts several leaves as several implicitly ANDed operands', () => {
    const domain = [
      ['stage_id', '=', 103],
      ['s_raf', '>', 0]
    ]
    expect(parseOdooDomain(domain)).toEqual({ ok: true, domain, operandCount: 2 })
  })

  it('accepts a balanced OR as one operand', () => {
    const domain = ['|', ['name', 'ilike', 'x'], ['name', 'ilike', 'y']]
    expect(parseOdooDomain(domain)).toEqual({ ok: true, domain, operandCount: 1 })
  })

  it('refuses an OR missing its second operand', () => {
    // The bug this exists for: spliced before the project scope, this '|' would
    // consume the scope leaf and parse clean.
    expect(error(['|', ['name', 'ilike', 'x']])).toBe(
      'The "|" operator at position 0 is missing an operand.'
    )
  })

  it('refuses a bare operator', () => {
    expect(error(['!'])).toBe('The "!" operator at position 0 is missing an operand.')
    expect(error(['&'])).toBe('The "&" operator at position 0 is missing an operand.')
  })

  it('names the innermost operator left unsatisfied', () => {
    expect(error(['&', '|', ['id', '=', 1]])).toBe(
      'The "|" operator at position 1 is missing an operand.'
    )
  })

  it('accepts negation, including a double one', () => {
    expect(parseOdooDomain(['!', ['id', '=', 1]]).ok).toBe(true)
    expect(parseOdooDomain(['!', '!', ['id', '=', 1]]).ok).toBe(true)
  })

  it('accepts nested groups', () => {
    const domain = [
      '&',
      '|',
      ['stage_id', '=', 103],
      ['stage_id', '=', 104],
      '!',
      ['user_ids', 'in', [2]]
    ]
    expect(parseOdooDomain(domain)).toEqual({ ok: true, domain, operandCount: 1 })
  })

  it('accepts a group followed by further top-level leaves', () => {
    const domain = ['|', ['id', '=', 1], ['id', '=', 2], ['project_id', 'in', [7]]]
    expect(parseOdooDomain(domain)).toEqual({ ok: true, domain, operandCount: 2 })
  })

  it('accepts every Odoo term operator', () => {
    const operators = [
      '=',
      '!=',
      '>',
      '>=',
      '<',
      '<=',
      '=?',
      '=like',
      '=ilike',
      'like',
      'not like',
      'ilike',
      'not ilike',
      'in',
      'not in',
      'child_of',
      'parent_of',
      'any',
      'not any'
    ]
    for (const operator of operators) {
      expect(parseOdooDomain([['partner_id', operator, 1]]).ok).toBe(true)
    }
  })

  it('accepts a dotted field path and a subdomain value it cannot interpret', () => {
    // Values are never inspected: a domain may filter on a custom field Orca
    // neither reads nor knows about.
    expect(
      parseOdooDomain([['partner_id.commercial_partner_id', 'any', [['active', '=', true]]]]).ok
    ).toBe(true)
  })

  it('refuses an unknown leaf operator', () => {
    expect(error([['name', '==', 'x']])).toBe(
      'The condition at position 0 uses an unknown operator "==".'
    )
    expect(error([['name', 7, 'x']])).toBe('The condition at position 0 uses an unknown operator.')
  })

  it('refuses a leaf that is not a triple', () => {
    expect(error([['name', 'ilike']])).toBe(
      'The condition at position 0 must read [field, operator, value].'
    )
    expect(error([['name', 'ilike', 'x', 'y']])).toBe(
      'The condition at position 0 must read [field, operator, value].'
    )
  })

  it('refuses a leaf without a field name', () => {
    expect(error([['', 'ilike', 'x']])).toBe(
      'The condition at position 0 must start with a field name.'
    )
    expect(error([[7, '=', 1]])).toBe('The condition at position 0 must start with a field name.')
  })

  it('refuses a token that is neither a condition nor an operator', () => {
    expect(error([['id', '=', 1], 'AND', ['id', '=', 2]])).toBe(
      'Position 1 is neither a condition nor one of "&", "|", "!".'
    )
    expect(error([null])).toBe('Position 0 is neither a condition nor one of "&", "|", "!".')
  })

  it('refuses a hole in a sparse domain instead of skipping it', () => {
    const domain = [
      ['id', '=', 1],
      ['id', '=', 2]
    ]
    delete domain[0]
    expect(error(domain)).toBe('Position 0 is neither a condition nor one of "&", "|", "!".')
  })

  it('refuses a value that is not an array at all', () => {
    expect(error('id = 1')).toBe('A domain must be a list of conditions.')
    expect(error(undefined)).toBe('A domain must be a list of conditions.')
    expect(error({ 0: ['id', '=', 1], length: 1 })).toBe('A domain must be a list of conditions.')
  })

  it('does not overflow the stack on a pathologically nested domain', () => {
    const domain = [...Array.from({ length: 50_000 }, () => '!'), ['id', '=', 1]]
    expect(parseOdooDomain(domain).ok).toBe(true)
  })
})

describe('andGroupedDomain', () => {
  it('leaves a domain that is already one operand alone', () => {
    const domain = ['|', ['id', '=', 1], ['id', '=', 2]]
    expect(andGroupedDomain(domain)).toEqual(domain)
    expect(andGroupedDomain([])).toEqual([])
  })

  it('prefixes n-1 ANDs so n top-level operands become one', () => {
    const grouped = andGroupedDomain([
      ['id', '=', 1],
      ['id', '=', 2],
      ['id', '=', 3]
    ])
    expect(grouped).toEqual(['&', '&', ['id', '=', 1], ['id', '=', 2], ['id', '=', 3]])
    expect(parseOdooDomain(grouped)).toMatchObject({ ok: true, operandCount: 1 })
  })

  it('cannot be reached by a trailing operator', () => {
    // Grouping an unbalanced domain would hand back the very shape that eats a
    // neighbouring leaf, so it throws instead.
    expect(() => andGroupedDomain(['|', ['id', '=', 1]])).toThrow(
      'The "|" operator at position 0 is missing an operand.'
    )
  })

  it('copies rather than mutating the caller’s domain', () => {
    const domain = [
      ['id', '=', 1],
      ['id', '=', 2]
    ]
    andGroupedDomain(domain)
    expect(domain).toHaveLength(2)
  })
})

describe('reserved token namespace', () => {
  it('accepts the current-user token as a leaf value', () => {
    expect(parseOdooDomain([['user_ids', 'in', [CURRENT_USER_TOKEN]]]).ok).toBe(true)
    expect(parseOdooDomain([['create_uid', '=', CURRENT_USER_TOKEN]]).ok).toBe(true)
  })

  it('accepts it nested in the subdomain of an `any` leaf', () => {
    expect(
      parseOdooDomain([['message_ids', 'any', [['author_id', '=', CURRENT_USER_TOKEN]]]]).ok
    ).toBe(true)
  })

  it('refuses an unknown token instead of sending it to Odoo as a literal', () => {
    // A typo must fail loudly: searched literally it would silently match nothing.
    expect(error([['user_ids', 'in', ['$orca:mee']]])).toBe(
      'The condition at position 0 uses an unknown Orca token "$orca:mee".'
    )
    expect(error([['user_ids', 'in', [`${CURRENT_USER_TOKEN} `]]])).toBe(
      'The condition at position 0 uses an unknown Orca token "$orca:me ".'
    )
  })

  it('leaves a lookalike outside the namespace alone', () => {
    expect(parseOdooDomain([['name', 'ilike', '@me']]).ok).toBe(true)
    expect(parseOdooDomain([['name', 'ilike', 'orca:me']]).ok).toBe(true)
  })

  it('refuses the reserved prefix in the field position', () => {
    expect(error([[CURRENT_USER_TOKEN, '=', 1]])).toBe(
      'The condition at position 0 uses the reserved "$orca:" prefix as a field name.'
    )
  })

  it('refuses a value nested past the depth any real subdomain reaches', () => {
    let value: unknown = CURRENT_USER_TOKEN
    for (let depth = 0; depth < 40; depth += 1) {
      value = [value]
    }
    expect(error([['user_ids', 'in', value]])).toBe(
      'The condition at position 0 nests its value too deeply.'
    )
  })
})
