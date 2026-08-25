import { afterEach, describe, expect, it } from 'vitest'

import {
  getDefaultSavedOdooTicketFilter,
  getPinnedSavedOdooTicketFilters,
  isSavedOdooTicketFilterActive,
  MAX_SAVED_FILTERS,
  ODOO_SEEDED_FILTER_PRESETS,
  parseSavedOdooTicketFilters,
  readSavedOdooTicketFilters,
  writeSavedOdooTicketFilters,
  removeSavedOdooTicketFilter,
  reorderSavedOdooTicketFilters,
  seedDefaultSavedOdooTicketFilters,
  setDefaultSavedOdooTicketFilter,
  toggleSavedOdooTicketFilterPin,
  upsertSavedOdooTicketFilter,
  type OdooSavedTicketFilter
} from './odoo-saved-ticket-filters'
import { DEFAULT_ODOO_TICKET_FILTERS } from './odoo-ticket-facets'
import { filterDomain } from '../../../shared/odoo-filter-preset-domain'
import { CURRENT_USER_TOKEN } from '../../../shared/odoo-domain-tokens'
import { parseOdooDomain } from '../../../shared/odoo-domain-validation'
import { ODOO_CLOSED_STATES } from '../../../shared/odoo-types'

const MINE = {
  ...DEFAULT_ODOO_TICKET_FILTERS,
  stages: ['Review'],
  assignees: ['5'],
  tags: ['9']
}

function saved(
  name: string,
  overrides: Partial<OdooSavedTicketFilter> = {}
): OdooSavedTicketFilter {
  return {
    id: name.toLowerCase(),
    name,
    filters: DEFAULT_ODOO_TICKET_FILTERS,
    ...overrides
  }
}

describe('parseSavedOdooTicketFilters', () => {
  it('returns an empty list for missing or malformed payloads', () => {
    expect(parseSavedOdooTicketFilters(null)).toEqual([])
    expect(parseSavedOdooTicketFilters('not json')).toEqual([])
    expect(parseSavedOdooTicketFilters('{"a":1}')).toEqual([])
  })

  it('drops entries without a usable name and de-duplicates by normalised name', () => {
    const raw = JSON.stringify([
      { name: 'Dev', preset: 'all', filters: MINE },
      { name: '  dev  ', preset: 'assigned', filters: DEFAULT_ODOO_TICKET_FILTERS },
      { name: '   ' },
      { preset: 'all' }
    ])
    const parsed = parseSavedOdooTicketFilters(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      id: 'dev',
      name: 'Dev',
      rawDomain: filterDomain('all'),
      filters: MINE
    })
  })

  it('falls back to safe defaults for unknown legacy presets and priorities', () => {
    // 'nope' read as 'assigned' in the build that stored it, so that is the set
    // the entry was showing and the domain it must migrate to.
    const raw = JSON.stringify([
      { name: 'Odd', preset: 'nope', filters: { priority: '9', stages: 42 } }
    ])
    expect(parseSavedOdooTicketFilters(raw)[0]).toEqual({
      id: 'odd',
      name: 'Odd',
      rawDomain: filterDomain('assigned'),
      filters: DEFAULT_ODOO_TICKET_FILTERS
    })
  })
})

describe('upsertSavedOdooTicketFilter', () => {
  it('appends a new entry', () => {
    const next = upsertSavedOdooTicketFilter([], {
      name: 'Mine',
      filters: MINE
    })
    expect(next).toEqual([{ id: 'mine', name: 'Mine', filters: MINE }])
  })

  it('replaces in place when the normalised name already exists', () => {
    const existing = [saved('Mine'), saved('Other')]
    const next = upsertSavedOdooTicketFilter(existing, {
      name: '  MINE ',
      filters: MINE
    })
    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({ id: 'mine', name: 'MINE', filters: MINE })
    expect(next[1]?.name).toBe('Other')
  })

  it('ignores a blank name', () => {
    expect(upsertSavedOdooTicketFilter([], { name: '   ', filters: MINE })).toEqual([])
  })
})

describe('saved-filter cap', () => {
  const atCap = Array.from({ length: MAX_SAVED_FILTERS }, (_unused, index) =>
    saved(`F${index + 1}`)
  )

  it('drops the oldest entry when a new one pushes past the cap', () => {
    const next = upsertSavedOdooTicketFilter(atCap, {
      name: 'Newest',
      filters: MINE
    })
    expect(next).toHaveLength(MAX_SAVED_FILTERS)
    expect(next.map((entry) => entry.id)).not.toContain('f1')
    expect(next.at(-1)?.id).toBe('newest')
  })

  it('leaves the list untouched when re-saving an existing entry at the cap', () => {
    const next = upsertSavedOdooTicketFilter(atCap, { name: 'F1', filters: MINE })
    expect(next).toHaveLength(MAX_SAVED_FILTERS)
    expect(next[0]?.id).toBe('f1')
  })

  it('keeps the newest entries when a stored payload exceeds the cap', () => {
    // Same end as upsert evicts from, so a read shows what the next save keeps.
    const raw = JSON.stringify(
      Array.from({ length: MAX_SAVED_FILTERS + 1 }, (_unused, index) => ({
        name: `F${index + 1}`,
        filters: {}
      }))
    )
    const parsed = parseSavedOdooTicketFilters(raw)
    expect(parsed).toHaveLength(MAX_SAVED_FILTERS)
    expect(parsed.map((entry) => entry.id)).not.toContain('f1')
    expect(parsed.at(-1)?.id).toBe(`f${MAX_SAVED_FILTERS + 1}`)
  })
})

describe('storage access', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  function stubThrowingStorage(): void {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem(): string {
            throw new Error('storage disabled')
          },
          setItem(): void {
            throw new Error('quota exceeded')
          }
        }
      }
    })
  }

  it('returns an empty list when reading storage throws', () => {
    stubThrowingStorage()
    expect(readSavedOdooTicketFilters()).toEqual([])
  })

  it('swallows a failing write so the calling handler still completes', () => {
    stubThrowingStorage()
    expect(() => writeSavedOdooTicketFilters([saved('Mine')])).not.toThrow()
  })
})

describe('legacy payload migration', () => {
  it('lifts a pre-multi-select single stage into the array', () => {
    const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { stage: 'Review' } }])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.stages).toEqual(['Review'])
  })

  it("treats the legacy 'all' sentinel as no stage filter", () => {
    const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { stage: 'all' } }])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.stages).toEqual([])
  })

  it('drops non-string entries from a stages array', () => {
    const raw = JSON.stringify([
      { name: 'Odd', preset: 'all', filters: { stages: ['Review', 7, 'Review'] } }
    ])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.stages).toEqual(['Review'])
  })

  it('widens an entry saved before the project selector to every project', () => {
    const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { stages: [] } }])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.projects).toEqual([])
  })

  it('lifts a pre-multi-select single project into the array', () => {
    const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { project: 'inst-a:7' } }])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.projects).toEqual(['inst-a:7'])
  })

  it("treats the legacy 'all' project sentinel as no project filter", () => {
    const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { project: 'all' } }])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.projects).toEqual([])
  })

  it.each([
    ['assignee', '5', 'assignees'],
    ['tag', '9', 'tags'],
    ['priority', '3', 'priorities']
  ])('lifts the pre-multi-select single %s into the array', (legacyKey, value, arrayKey) => {
    const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { [legacyKey]: value } }])
    const parsed = parseSavedOdooTicketFilters(raw)[0]?.filters as unknown as Record<
      string,
      string[]
    >
    expect(parsed[arrayKey]).toEqual([value])
  })

  it.each(['assignee', 'tag', 'priority'])(
    "treats the legacy 'all' %s sentinel as no filter",
    (legacyKey) => {
      const raw = JSON.stringify([{ name: 'Old', preset: 'all', filters: { [legacyKey]: 'all' } }])
      expect(parseSavedOdooTicketFilters(raw)[0]?.filters).toEqual(DEFAULT_ODOO_TICKET_FILTERS)
    }
  )

  it('drops an unknown priority code rather than storing it', () => {
    const raw = JSON.stringify([
      { name: 'Odd', preset: 'all', filters: { priorities: ['3', '9', 'nope'] } }
    ])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.priorities).toEqual(['3'])
  })

  it('does not let two saved entries alias any facet array', () => {
    // One copy per facet: five aliasing bugs are possible here, not one.
    const filters = {
      ...DEFAULT_ODOO_TICKET_FILTERS,
      stages: ['Review'],
      priorities: ['3' as const],
      assignees: ['5'],
      tags: ['9'],
      projects: ['inst-a:7']
    }
    const once = upsertSavedOdooTicketFilter([], { name: 'A', filters })
    const twice = upsertSavedOdooTicketFilter(once, { name: 'B', filters })
    for (const facet of ['stages', 'priorities', 'assignees', 'tags', 'projects'] as const) {
      expect(twice[0]?.filters[facet]).not.toBe(twice[1]?.filters[facet])
      expect(twice[0]?.filters[facet]).not.toBe(filters[facet])
    }
  })
})

describe('setDefaultSavedOdooTicketFilter', () => {
  it('stars one entry and clears the others', () => {
    const next = setDefaultSavedOdooTicketFilter([saved('A', { isDefault: true }), saved('B')], 'b')
    expect(next.map((entry) => entry.isDefault)).toEqual([undefined, true])
  })

  it('unstars when the already-default entry is picked again', () => {
    const next = setDefaultSavedOdooTicketFilter([saved('A', { isDefault: true })], 'a')
    expect(getDefaultSavedOdooTicketFilter(next)).toBeNull()
  })

  it('keeps a single default when the stored payload starred several', () => {
    const raw = JSON.stringify([
      { name: 'A', preset: 'all', filters: {}, isDefault: true },
      { name: 'B', preset: 'all', filters: {}, isDefault: true }
    ])
    const parsed = parseSavedOdooTicketFilters(raw)
    expect(parsed.filter((entry) => entry.isDefault)).toHaveLength(1)
    expect(getDefaultSavedOdooTicketFilter(parsed)?.name).toBe('A')
  })

  it('keeps the star when re-saving under the same name', () => {
    const next = upsertSavedOdooTicketFilter([saved('Mine', { isDefault: true })], {
      name: 'Mine',
      filters: MINE
    })
    expect(next[0]?.isDefault).toBe(true)
  })
})

describe('removeSavedOdooTicketFilter', () => {
  it('drops only the matching id', () => {
    const next = removeSavedOdooTicketFilter([saved('Mine'), saved('Other')], 'mine')
    expect(next.map((entry) => entry.id)).toEqual(['other'])
  })
})

describe('toggleSavedOdooTicketFilterPin', () => {
  it('pins and unpins only the matching entry', () => {
    const list = [saved('A'), saved('B')]
    const pinned = toggleSavedOdooTicketFilterPin(list, 'a')
    expect(pinned.map((entry) => entry.pinned)).toEqual([true, undefined])
    expect(toggleSavedOdooTicketFilterPin(pinned, 'a')[0]?.pinned).toBeUndefined()
  })

  it('keeps the pin when re-saving under the same name', () => {
    const next = upsertSavedOdooTicketFilter([saved('Mine', { pinned: true })], {
      name: 'Mine',
      filters: MINE
    })
    expect(next[0]?.pinned).toBe(true)
  })

  it('round-trips the pin through a stored payload', () => {
    const raw = JSON.stringify([
      { name: 'A', preset: 'all', filters: {}, pinned: true },
      { name: 'B', preset: 'all', filters: {} }
    ])
    expect(getPinnedSavedOdooTicketFilters(parseSavedOdooTicketFilters(raw))).toHaveLength(1)
  })
})

describe('reorderSavedOdooTicketFilters', () => {
  const list = [saved('A'), saved('B'), saved('C')]

  it('moves an entry down to the target slot', () => {
    expect(reorderSavedOdooTicketFilters(list, 'a', 'c').map((entry) => entry.id)).toEqual([
      'b',
      'c',
      'a'
    ])
  })

  it('moves an entry up to the target slot', () => {
    expect(reorderSavedOdooTicketFilters(list, 'c', 'a').map((entry) => entry.id)).toEqual([
      'c',
      'a',
      'b'
    ])
  })

  it('is a no-op for unknown or identical ids, without mutating the input', () => {
    expect(reorderSavedOdooTicketFilters(list, 'a', 'a').map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c'
    ])
    expect(reorderSavedOdooTicketFilters(list, 'nope', 'a').map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c'
    ])
    expect(list.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('drives the pinned chip order', () => {
    const pinned = [saved('A', { pinned: true }), saved('B'), saved('C', { pinned: true })]
    const next = reorderSavedOdooTicketFilters(pinned, 'c', 'a')
    expect(getPinnedSavedOdooTicketFilters(next).map((entry) => entry.id)).toEqual(['c', 'a'])
  })
})

describe('seedDefaultSavedOdooTicketFilters', () => {
  it("creates one pinned entry per seeded preset, carrying that preset's domain", () => {
    const seeded = seedDefaultSavedOdooTicketFilters((preset) => `Label ${preset}`)
    expect(seeded.map((entry) => entry.rawDomain)).toEqual(
      ODOO_SEEDED_FILTER_PRESETS.map((preset) => filterDomain(preset))
    )
    expect(seeded.every((entry) => entry.pinned === true)).toBe(true)
    expect(getDefaultSavedOdooTicketFilter(seeded)?.rawDomain).toEqual(
      filterDomain(ODOO_SEEDED_FILTER_PRESETS[0] ?? 'assigned')
    )
  })

  it('survives the round trip it writes to storage on first run', () => {
    // The seeded domains go straight back through the validator on next launch;
    // a domain it refused would make the starter chips vanish silently.
    const seeded = seedDefaultSavedOdooTicketFilters((preset) => `Label ${preset}`)
    const reread = parseSavedOdooTicketFilters(JSON.stringify(seeded))
    expect(reread.map((entry) => entry.rawDomain)).toEqual(seeded.map((entry) => entry.rawDomain))
    expect(reread.map((entry) => entry.pinned)).toEqual(seeded.map((entry) => entry.pinned))
    expect(getDefaultSavedOdooTicketFilter(reread)?.name).toBe(seeded[0]?.name)
  })

  it('produces entries the user can delete like any other', () => {
    const seeded = seedDefaultSavedOdooTicketFilters((preset) => `Label ${preset}`)
    const first = seeded[0]?.id ?? ''
    expect(removeSavedOdooTicketFilter(seeded, first).map((entry) => entry.id)).not.toContain(first)
  })
})

describe('isSavedOdooTicketFilterActive', () => {
  it('matches only when the raw domain and every facet agree', () => {
    const entry = saved('Mine', { rawDomain: filterDomain('all'), filters: MINE })
    expect(isSavedOdooTicketFilterActive(entry, MINE, filterDomain('all'))).toBe(true)
    expect(isSavedOdooTicketFilterActive(entry, MINE, filterDomain('assigned'))).toBe(false)
    expect(isSavedOdooTicketFilterActive(entry, MINE)).toBe(false)
    expect(isSavedOdooTicketFilterActive(entry, { ...MINE, tags: [] }, filterDomain('all'))).toBe(
      false
    )
    expect(isSavedOdooTicketFilterActive(entry, { ...MINE, stages: [] }, filterDomain('all'))).toBe(
      false
    )
  })

  it('reads a domain-less entry as active only against a domain-less toolbar', () => {
    const entry = saved('Facets only', { filters: MINE })
    expect(isSavedOdooTicketFilterActive(entry, MINE)).toBe(true)
    expect(isSavedOdooTicketFilterActive(entry, MINE, [])).toBe(true)
    expect(isSavedOdooTicketFilterActive(entry, MINE, [['s_raf', '>', 0]])).toBe(false)
  })
})

describe('project scope in saved filters', () => {
  it('round trips a project selection through storage', () => {
    const scoped = { ...DEFAULT_ODOO_TICKET_FILTERS, projects: ['inst-a:7', 'inst-a:9'] }
    const stored = upsertSavedOdooTicketFilter([], {
      name: 'Acme work',
      filters: scoped
    })
    const parsed = parseSavedOdooTicketFilters(JSON.stringify(stored))
    expect(parsed[0]?.filters.projects).toEqual(['inst-a:7', 'inst-a:9'])
  })

  it('does not let two saved entries alias one projects array', () => {
    const filters = { ...DEFAULT_ODOO_TICKET_FILTERS, projects: ['inst-a:7'] }
    const once = upsertSavedOdooTicketFilter([], { name: 'A', filters })
    const twice = upsertSavedOdooTicketFilter(once, { name: 'B', filters })
    expect(twice[0]?.filters.projects).not.toBe(twice[1]?.filters.projects)
    expect(twice[0]?.filters.projects).not.toBe(filters.projects)
  })

  it('drops non-string entries from a stored projects array', () => {
    const raw = JSON.stringify([
      { name: 'Odd', preset: 'all', filters: { projects: ['inst-a:7', 7, 'inst-a:7'] } }
    ])
    expect(parseSavedOdooTicketFilters(raw)[0]?.filters.projects).toEqual(['inst-a:7'])
  })

  it('reads as inactive while the toolbar sits on a different selection', () => {
    const entry = saved('Acme work', {
      filters: { ...DEFAULT_ODOO_TICKET_FILTERS, projects: ['inst-a:7'] }
    })
    expect(
      isSavedOdooTicketFilterActive(entry, {
        ...DEFAULT_ODOO_TICKET_FILTERS,
        projects: ['inst-a:7']
      })
    ).toBe(true)
    // Same preset and facets, different project: the chip must not read as active.
    expect(
      isSavedOdooTicketFilterActive(entry, {
        ...DEFAULT_ODOO_TICKET_FILTERS,
        projects: ['inst-a:8']
      })
    ).toBe(false)
    // A superset is not the saved view either.
    expect(
      isSavedOdooTicketFilterActive(entry, {
        ...DEFAULT_ODOO_TICKET_FILTERS,
        projects: ['inst-a:7', 'inst-a:8']
      })
    ).toBe(false)
    expect(isSavedOdooTicketFilterActive(entry, DEFAULT_ODOO_TICKET_FILTERS)).toBe(false)
  })

  it('ignores selection order when matching', () => {
    const entry = saved('Two', {
      filters: { ...DEFAULT_ODOO_TICKET_FILTERS, projects: ['inst-a:7', 'inst-a:9'] }
    })
    expect(
      isSavedOdooTicketFilterActive(entry, {
        ...DEFAULT_ODOO_TICKET_FILTERS,
        projects: ['inst-a:9', 'inst-a:7']
      })
    ).toBe(true)
  })
})

describe('preset migration', () => {
  // The two entries the previous build seeded, verbatim: preset + facets, the
  // first starred, both pinned.
  const V1_PAYLOAD = JSON.stringify([
    {
      id: 'assigned to me',
      name: 'Assigned to me',
      preset: 'assigned',
      filters: { stages: [], priorities: [], assignees: [], tags: [], projects: [] },
      pinned: true,
      isDefault: true
    },
    {
      id: 'all tickets',
      name: 'All tickets',
      preset: 'all',
      filters: { stages: [], priorities: [], assignees: [], tags: [], projects: [] },
      pinned: true
    }
  ])

  it('turns the seeded presets into their domains, keeping star and pin', () => {
    const parsed = parseSavedOdooTicketFilters(V1_PAYLOAD)
    expect(parsed.map((entry) => entry.name)).toEqual(['Assigned to me', 'All tickets'])
    expect(parsed.map((entry) => entry.rawDomain)).toEqual([
      filterDomain('assigned'),
      filterDomain('all')
    ])
    expect(parsed.map((entry) => entry.pinned)).toEqual([true, true])
    expect(getDefaultSavedOdooTicketFilter(parsed)?.name).toBe('Assigned to me')
  })

  it('leaves no preset behind on a migrated entry', () => {
    for (const entry of parseSavedOdooTicketFilters(V1_PAYLOAD)) {
      expect(entry).not.toHaveProperty('preset')
    }
  })

  it('migrates the current user as a token, never as a resolved uid', () => {
    // A uid is resolved per instance, so a stored one reads as a stranger on the
    // next database — silently.
    const [assigned] = parseSavedOdooTicketFilters(V1_PAYLOAD)
    expect(JSON.stringify(assigned?.rawDomain)).toContain(CURRENT_USER_TOKEN)
  })

  it.each(['assigned', 'reported', 'all', 'done'] as const)(
    'migrates the %s preset to a domain the validator accepts',
    (preset) => {
      const raw = JSON.stringify([{ name: preset, preset, filters: {} }])
      const migrated = parseSavedOdooTicketFilters(raw)[0]?.rawDomain
      expect(migrated).toEqual(filterDomain(preset))
      expect(parseOdooDomain(migrated ?? []).ok).toBe(true)
    }
  )

  it('keeps the open/closed split the presets stood for', () => {
    const raw = JSON.stringify([
      { name: 'Open', preset: 'all', filters: {} },
      { name: 'Closed', preset: 'done', filters: {} }
    ])
    const parsed = parseSavedOdooTicketFilters(raw)
    expect(parsed[0]?.rawDomain).toEqual([['state', 'not in', [...ODOO_CLOSED_STATES]]])
    expect(parsed[1]?.rawDomain).toEqual([['state', 'in', [...ODOO_CLOSED_STATES]]])
  })

  it('keeps the facets a v1 entry narrowed by alongside the migrated domain', () => {
    const raw = JSON.stringify([
      { name: 'Mine in review', preset: 'assigned', filters: { stages: ['Review'], tags: ['9'] } }
    ])
    const [entry] = parseSavedOdooTicketFilters(raw)
    expect(entry?.filters.stages).toEqual(['Review'])
    expect(entry?.filters.tags).toEqual(['9'])
    expect(entry?.rawDomain).toEqual(filterDomain('assigned'))
  })
})

describe('raw domain in saved filters', () => {
  const RAF = [['s_raf', '>', 0]]

  it('round trips a hand-written domain through storage', () => {
    const stored = upsertSavedOdooTicketFilter([], {
      name: 'Remaining work',
      filters: DEFAULT_ODOO_TICKET_FILTERS,
      rawDomain: RAF
    })
    expect(parseSavedOdooTicketFilters(JSON.stringify(stored))[0]?.rawDomain).toEqual(RAF)
  })

  it('abandons an entry whose domain is unreadable, keeping its neighbours', () => {
    // Half-converting it would read a wider set than the entry was saved as.
    const raw = JSON.stringify([
      { name: 'Broken', filters: {}, rawDomain: ['|', ['s_raf', '>', 0]] },
      { name: 'Fine', filters: {}, rawDomain: RAF }
    ])
    expect(parseSavedOdooTicketFilters(raw).map((entry) => entry.name)).toEqual(['Fine'])
  })

  it.each([
    ['an unknown operator', [['s_raf', '~=', 0]]],
    ['a reserved token as a field', [[CURRENT_USER_TOKEN, '=', 1]]],
    ['an unknown Orca token', [['user_ids', 'in', ['$orca:nope']]]],
    ['a non-domain payload', { s_raf: 0 }]
  ])('abandons an entry carrying %s', (_label, rawDomain) => {
    const raw = JSON.stringify([{ name: 'Broken', filters: {}, rawDomain }])
    expect(parseSavedOdooTicketFilters(raw)).toEqual([])
  })

  it('normalises an empty domain away rather than storing it', () => {
    // It matches everything, so keeping it would only perturb the read cache key.
    const stored = upsertSavedOdooTicketFilter([], {
      name: 'Everything',
      filters: DEFAULT_ODOO_TICKET_FILTERS,
      rawDomain: []
    })
    expect(stored[0]).not.toHaveProperty('rawDomain')
    expect(
      parseSavedOdooTicketFilters(JSON.stringify([{ name: 'A', filters: {}, rawDomain: [] }]))[0]
    ).not.toHaveProperty('rawDomain')
  })

  it('refuses to save an unreadable domain, the way it refuses a blank name', () => {
    const existing = [saved('Mine')]
    expect(
      upsertSavedOdooTicketFilter(existing, {
        name: 'Broken',
        filters: DEFAULT_ODOO_TICKET_FILTERS,
        rawDomain: ['&', ['s_raf', '>', 0]]
      })
    ).toEqual(existing)
  })

  it('does not let two saved entries alias one domain array', () => {
    const once = upsertSavedOdooTicketFilter([], {
      name: 'A',
      filters: DEFAULT_ODOO_TICKET_FILTERS,
      rawDomain: RAF
    })
    const twice = upsertSavedOdooTicketFilter(once, {
      name: 'B',
      filters: DEFAULT_ODOO_TICKET_FILTERS,
      rawDomain: RAF
    })
    expect(twice[0]?.rawDomain).not.toBe(twice[1]?.rawDomain)
    expect(twice[0]?.rawDomain).not.toBe(RAF)
  })

  it('keeps its own domain over a stray legacy preset', () => {
    const raw = JSON.stringify([{ name: 'Both', preset: 'done', filters: {}, rawDomain: RAF }])
    expect(parseSavedOdooTicketFilters(raw)[0]?.rawDomain).toEqual(RAF)
  })

  it('reads an entry with neither domain nor preset as facets-only', () => {
    const raw = JSON.stringify([{ name: 'Facets', filters: { stages: ['Review'] } }])
    const [entry] = parseSavedOdooTicketFilters(raw)
    expect(entry).not.toHaveProperty('rawDomain')
    expect(entry?.filters.stages).toEqual(['Review'])
  })
})
