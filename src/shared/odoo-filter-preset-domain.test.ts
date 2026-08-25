import { describe, expect, it } from 'vitest'
import { CURRENT_USER_TOKEN } from './odoo-domain-tokens'
import { parseOdooDomain } from './odoo-domain-validation'
import { filterDomain } from './odoo-filter-preset-domain'

describe('filterDomain', () => {
  it('compiles a preset without folding BASE_DOMAIN in', () => {
    // The read AND-composes BASE_DOMAIN itself; a preset that carried it too
    // could not be stored as a filter domain.
    for (const filter of ['assigned', 'reported', 'all', 'done'] as const) {
      expect(filterDomain(filter)).not.toContainEqual(['has_template_ancestor', '=', false])
      expect(parseOdooDomain(filterDomain(filter)).ok).toBe(true)
    }
  })

  it('emits the current-user token rather than a resolved uid', () => {
    // A uid resolved here would be wrong on every other instance.
    expect(filterDomain('assigned')).toContainEqual(['user_ids', 'in', [CURRENT_USER_TOKEN]])
    expect(filterDomain('reported')).toContainEqual(['create_uid', '=', CURRENT_USER_TOKEN])
  })

  it('keeps the open/closed split of each preset', () => {
    expect(filterDomain('done')).toContainEqual(['state', 'in', ['1_done', '1_canceled']])
    expect(filterDomain('all')).toEqual([['state', 'not in', ['1_done', '1_canceled']]])
  })
})
