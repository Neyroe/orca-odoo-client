import { describe, expect, it } from 'vitest'

import { DEFAULT_ODOO_TICKET_FILTERS, type OdooTicketListFilters } from './odoo-ticket-facets'
import {
  compileOdooTicketFilterDomain,
  odooTicketFilterDomainsEqual
} from './odoo-ticket-filter-domain'
import { CURRENT_USER_TOKEN } from '../../../shared/odoo-domain-tokens'
import { parseOdooDomain } from '../../../shared/odoo-domain-validation'
import type { OdooDomain } from '../../../shared/odoo-types'

/** Spread over the defaults so a new facet needs no edit in every case. */
function filters(overrides: Partial<OdooTicketListFilters> = {}): OdooTicketListFilters {
  return { ...DEFAULT_ODOO_TICKET_FILTERS, ...overrides }
}

function compiled(
  overrides: Partial<OdooTicketListFilters> = {},
  args: { viewerUid?: number | null; rawDomain?: OdooDomain | null } = {}
): OdooDomain {
  const result = compileOdooTicketFilterDomain({ filters: filters(overrides), ...args })
  if (!result.ok) {
    throw new Error(`expected a domain, got: ${result.error}`)
  }
  return result.domain
}

/** Every compiled domain must survive the check the read runs before Odoo sees it. */
function operandCount(domain: OdooDomain): number {
  const parsed = parseOdooDomain(domain)
  expect(parsed.ok).toBe(true)
  return parsed.ok ? parsed.operandCount : -1
}

describe('compileOdooTicketFilterDomain', () => {
  it('asks for everything when no facet is selected', () => {
    expect(compiled()).toEqual([])
    expect(operandCount(compiled())).toBe(0)
  })

  it('filters stages by name, not by id', () => {
    // `project.task.type` ids are per-database; a stored id names another stage
    // on the next instance.
    expect(compiled({ stages: ['Review'] })).toEqual([['stage_id.name', 'in', ['Review']]])
  })

  it('unions several values of one facet inside a single leaf', () => {
    expect(compiled({ stages: ['Review', 'Doing'] })).toEqual([
      ['stage_id.name', 'in', ['Doing', 'Review']]
    ])
    expect(operandCount(compiled({ stages: ['Review', 'Doing'] }))).toBe(1)
  })

  it('compiles priorities as their selection codes', () => {
    expect(compiled({ priorities: ['3', '0'] })).toEqual([['priority', 'in', ['0', '3']]])
  })

  it('compiles tag ids as numbers', () => {
    expect(compiled({ tags: ['9'] })).toEqual([['tag_ids', 'in', [9]]])
  })

  it('compiles assignee ids as numbers', () => {
    expect(compiled({ assignees: ['5'] })).toEqual([['user_ids', 'in', [5]]])
  })

  it('compiles the unassigned sentinel as the unowned leaf', () => {
    expect(compiled({ assignees: ['unassigned'] })).toEqual([['user_ids', '=', false]])
  })

  it('unions the unassigned sentinel with a real assignee under a prefix OR', () => {
    const domain = compiled({ assignees: ['unassigned', '5'] })
    expect(domain).toEqual(['|', ['user_ids', 'in', [5]], ['user_ids', '=', false]])
    // One operand, so it AND-composes with the facets around it rather than
    // swallowing one of them.
    expect(operandCount(domain)).toBe(1)
  })

  it('emits the signed-in user as a token, never as a resolved uid', () => {
    // A uid is resolved per instance: id 180 is a stranger on the next database,
    // and the read would come back wrong with nothing to raise.
    expect(compiled({ assignees: ['180'] }, { viewerUid: 180 })).toEqual([
      ['user_ids', 'in', [CURRENT_USER_TOKEN]]
    ])
  })

  it('keeps other assignees beside the token, with the token leading', () => {
    expect(compiled({ assignees: ['7', '180', '3'] }, { viewerUid: 180 })).toEqual([
      ['user_ids', 'in', [CURRENT_USER_TOKEN, 3, 7]]
    ])
  })

  it('leaves ids alone when no viewer is known', () => {
    expect(compiled({ assignees: ['180'] }, { viewerUid: null })).toEqual([
      ['user_ids', 'in', [180]]
    ])
  })

  it('unions the token with the unowned leaf', () => {
    const domain = compiled({ assignees: ['unassigned', '180'] }, { viewerUid: 180 })
    expect(domain).toEqual([
      '|',
      ['user_ids', 'in', [CURRENT_USER_TOKEN]],
      ['user_ids', '=', false]
    ])
    expect(operandCount(domain)).toBe(1)
  })

  it('sorts ids numerically, so 10 does not lead 9', () => {
    expect(compiled({ tags: ['10', '9'] })).toEqual([['tag_ids', 'in', [9, 10]]])
  })

  it('drops a non-numeric id rather than emitting null', () => {
    // Number('x') serialises to null, which filters on nothing and says nothing.
    expect(compiled({ tags: ['9', 'x', '', '-1', '1.5'] })).toEqual([['tag_ids', 'in', [9]]])
  })

  it('de-duplicates a repeated selection', () => {
    expect(compiled({ stages: ['Review', 'Review'], tags: ['9', '9'] })).toEqual([
      ['stage_id.name', 'in', ['Review']],
      ['tag_ids', 'in', [9]]
    ])
  })

  it('reads different facets as a conjunction', () => {
    const domain = compiled({
      stages: ['Review'],
      priorities: ['3'],
      assignees: ['5'],
      tags: ['9']
    })
    expect(domain).toEqual([
      ['stage_id.name', 'in', ['Review']],
      ['priority', 'in', ['3']],
      ['user_ids', 'in', [5]],
      ['tag_ids', 'in', [9]]
    ])
    // Four operands Odoo ANDs implicitly; `readWithDomain` groups them explicitly.
    expect(operandCount(domain)).toBe(4)
  })

  it('keeps the OR branch intact among the other facets', () => {
    const domain = compiled({ stages: ['Review'], assignees: ['unassigned', '5'], tags: ['9'] })
    expect(operandCount(domain)).toBe(3)
    expect(domain).toEqual([
      ['stage_id.name', 'in', ['Review']],
      '|',
      ['user_ids', 'in', [5]],
      ['user_ids', '=', false],
      ['tag_ids', 'in', [9]]
    ])
  })

  it('never compiles the project selection into the domain', () => {
    // `projectScopeDomain` is already server-side and instance-aware: it answers
    // null for an out-of-scope instance, which skips that round trip entirely.
    expect(compiled({ projects: ['inst-a:7', 'noProject'] })).toEqual([])
  })

  it.each([
    ['stages', { stages: ['Review', 'Doing'] }],
    ['priorities', { priorities: ['3', '0'] as OdooTicketListFilters['priorities'] }],
    ['assignees', { assignees: ['5', 'unassigned'] }],
    ['tags', { tags: ['10', '9'] }],
    [
      'every facet at once',
      {
        stages: ['Review'],
        priorities: ['2'] as OdooTicketListFilters['priorities'],
        assignees: ['5', 'unassigned'],
        tags: ['9']
      }
    ]
  ])('compiles %s into a domain the validator accepts', (_label, overrides) => {
    expect(parseOdooDomain(compiled(overrides)).ok).toBe(true)
  })
})

describe('compiled domain determinism', () => {
  // The list cache keys on JSON.stringify(domain) with a 500-entry ceiling, so an
  // unstable compilation mines two entries for one filter and halves the TTL's
  // usefulness.
  const CANONICAL = filters({
    stages: ['Doing', 'Review'],
    priorities: ['0', '3'],
    assignees: ['3', '180', 'unassigned'],
    tags: ['9', '10']
  })
  const SHUFFLED: OdooTicketListFilters[] = [
    filters({
      stages: ['Review', 'Doing'],
      priorities: ['3', '0'],
      assignees: ['unassigned', '180', '3'],
      tags: ['10', '9']
    }),
    filters({
      stages: ['Doing', 'Review'],
      priorities: ['0', '3'],
      assignees: ['180', 'unassigned', '3'],
      tags: ['9', '10']
    }),
    filters({
      stages: ['Review', 'Doing'],
      priorities: ['0', '3'],
      assignees: ['3', 'unassigned', '180'],
      tags: ['10', '9']
    })
  ]

  it.each([undefined, 180])('serialises the same set identically for viewer %s', (viewerUid) => {
    const expected = JSON.stringify(
      compileOdooTicketFilterDomain({ filters: CANONICAL, viewerUid })
    )
    for (const shuffled of SHUFFLED) {
      expect(JSON.stringify(compileOdooTicketFilterDomain({ filters: shuffled, viewerUid }))).toBe(
        expected
      )
    }
  })

  it('pins the token to the head of a mixed assignee list', () => {
    // The one ordering the [user, unassigned] case cannot reach.
    const first = compiled({ assignees: ['180', '3'] }, { viewerUid: 180 })
    const second = compiled({ assignees: ['3', '180'] }, { viewerUid: 180 })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toEqual([['user_ids', 'in', [CURRENT_USER_TOKEN, 3]]])
  })

  it('compiles the same filter identically across repeated calls', () => {
    expect(
      JSON.stringify(compiled({ stages: ['Review'] }, { rawDomain: [['s_raf', '>', 0]] }))
    ).toBe(JSON.stringify(compiled({ stages: ['Review'] }, { rawDomain: [['s_raf', '>', 0]] })))
  })
})

describe('raw domain in a compiled filter', () => {
  it('appends a hand-written domain after the facets', () => {
    const domain = compiled({ stages: ['Review'] }, { rawDomain: [['s_raf', '>', 0]] })
    expect(domain).toEqual([
      ['stage_id.name', 'in', ['Review']],
      ['s_raf', '>', 0]
    ])
    expect(operandCount(domain)).toBe(2)
  })

  it('runs a raw domain on its own', () => {
    expect(compiled({}, { rawDomain: [['s_raf', '>', 0]] })).toEqual([['s_raf', '>', 0]])
  })

  it('groups a multi-operand raw domain so it cannot swallow a facet leaf', () => {
    const domain = compiled(
      { stages: ['Review'] },
      {
        rawDomain: [
          ['s_raf', '>', 0],
          ['s_done', '=', false]
        ]
      }
    )
    expect(domain).toEqual([
      ['stage_id.name', 'in', ['Review']],
      '&',
      ['s_raf', '>', 0],
      ['s_done', '=', false]
    ])
    expect(operandCount(domain)).toBe(2)
  })

  it('keeps an OR raw domain balanced beside a facet', () => {
    const domain = compiled(
      { tags: ['9'] },
      { rawDomain: ['|', ['s_raf', '>', 0], ['s_done', '=', false]] }
    )
    expect(operandCount(domain)).toBe(2)
    expect(domain[0]).toEqual(['tag_ids', 'in', [9]])
  })

  it('treats an empty raw domain as none', () => {
    expect(compiled({ tags: ['9'] }, { rawDomain: [] })).toEqual([['tag_ids', 'in', [9]]])
  })

  it.each([
    ['an operator missing an operand', ['&', ['s_raf', '>', 0]]],
    ['an unknown operator', [['s_raf', '~=', 0]]],
    ['a leaf that is not a triple', [['s_raf', '>']]],
    ['an unknown Orca token', [['user_ids', 'in', ['$orca:nope']]]],
    ['the reserved prefix as a field', [[CURRENT_USER_TOKEN, '=', 1]]]
  ])('refuses %s instead of running it', (_label, rawDomain) => {
    const result = compileOdooTicketFilterDomain({
      filters: filters({ stages: ['Review'] }),
      rawDomain
    })
    expect(result.ok).toBe(false)
  })

  it('says what is wrong rather than throwing', () => {
    const result = compileOdooTicketFilterDomain({
      filters: filters(),
      rawDomain: ['&', ['s_raf', '>', 0]]
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('&')
    }
  })
})

describe('odooTicketFilterDomainsEqual', () => {
  it('reads absent, null and empty as the same question', () => {
    expect(odooTicketFilterDomainsEqual(undefined, null)).toBe(true)
    expect(odooTicketFilterDomainsEqual([], undefined)).toBe(true)
  })

  it('separates two different domains', () => {
    expect(odooTicketFilterDomainsEqual([['s_raf', '>', 0]], [['s_raf', '>', 1]])).toBe(false)
    expect(odooTicketFilterDomainsEqual([['s_raf', '>', 0]], null)).toBe(false)
  })

  it('matches an identical domain', () => {
    expect(odooTicketFilterDomainsEqual([['s_raf', '>', 0]], [['s_raf', '>', 0]])).toBe(true)
  })
})
