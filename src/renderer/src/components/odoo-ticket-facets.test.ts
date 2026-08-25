import { describe, expect, it } from 'vitest'

import {
  deriveOdooTicketFacets,
  odooProjectFilterOptions,
  odooProjectFilterValue,
  parseOdooProjectFilters,
  retainResolvableOdooProjectFilters
} from './odoo-ticket-facets'
import type { OdooTicket } from '../../../shared/odoo-types'
function ticket(overrides: Partial<OdooTicket>): OdooTicket {
  return {
    id: 1,
    ref: '#1',
    title: 'Ticket',
    url: 'https://odoo.example/1',
    state: '01_in_progress',
    priority: '0',
    tags: [],
    assignees: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

describe('deriveOdooTicketFacets', () => {
  it('collects unique, alphabetically sorted stages/assignees/tags', () => {
    const tickets = [
      ticket({
        id: 1,
        stage: { id: 2, name: 'Doing', sequence: 1, fold: false },
        assignees: [{ id: 5, displayName: 'Zoe' }],
        tags: [{ id: 9, name: 'urgent' }]
      }),
      ticket({
        id: 2,
        stage: { id: 1, name: 'Backlog', sequence: 0, fold: false },
        assignees: [
          { id: 5, displayName: 'Zoe' },
          { id: 3, displayName: 'Ana' }
        ],
        tags: [{ id: 9, name: 'urgent' }]
      })
    ]
    const facets = deriveOdooTicketFacets(tickets)
    expect(facets.stages).toEqual(['Backlog', 'Doing'])
    expect(facets.assignees).toEqual([
      { id: 3, label: 'Ana' },
      { id: 5, label: 'Zoe' }
    ])
    expect(facets.tags).toEqual([{ id: 9, label: 'urgent' }])
  })
})

describe('project filter values', () => {
  const project = { id: 7, name: 'Acme', instanceId: 'inst-a', instanceName: 'Acme SA' }

  it('round trips a project through its filter value', () => {
    const value = odooProjectFilterValue(project)
    expect(value).toBe('inst-a:7')
    expect(parseOdooProjectFilters([value ?? ''])).toEqual({
      projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
      includeNoProject: false
    })
  })

  it('refuses to encode a project with no instance id', () => {
    // Offering it would read as a project scope while the read went out unscoped.
    expect(odooProjectFilterValue({ id: 7 })).toBeNull()
  })

  it('groups several projects of one instance into a single leaf', () => {
    expect(parseOdooProjectFilters(['inst-a:7', 'inst-a:9'])).toEqual({
      projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7, 9] }],
      includeNoProject: false
    })
  })

  it('keeps each instance ids separate', () => {
    // Cross-instance selection: one leaf per database, never a merged id list.
    expect(parseOdooProjectFilters(['inst-a:7', 'inst-b:7', 'inst-b:3'])).toEqual({
      projectsByInstance: [
        { instanceId: 'inst-a', projectIds: [7] },
        { instanceId: 'inst-b', projectIds: [7, 3] }
      ],
      includeNoProject: false
    })
  })

  it('de-duplicates a repeated project', () => {
    expect(parseOdooProjectFilters(['inst-a:7', 'inst-a:7'])).toEqual({
      projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
      includeNoProject: false
    })
  })

  it('carries the no-project sentinel alongside project ids', () => {
    expect(parseOdooProjectFilters(['inst-a:7', 'noProject'])).toEqual({
      projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
      includeNoProject: true
    })
  })

  it('reads the no-project sentinel alone as its own scope', () => {
    expect(parseOdooProjectFilters(['noProject'])).toEqual({
      projectsByInstance: [],
      includeNoProject: true
    })
  })

  it('asks for no scope on an empty selection', () => {
    expect(parseOdooProjectFilters([])).toBeNull()
  })

  it.each([[''], [':7'], ['inst-a:'], ['inst-a:0'], ['inst-a:-3'], ['inst-a:1.5'], ['inst-a:abc']])(
    'drops the malformed value %o rather than scoping to a guess',
    (value) => {
      expect(parseOdooProjectFilters([value])).toBeNull()
    }
  )

  it('keeps the instance half of a value whose id contains no separator', () => {
    // Instance ids are base64url, so the last ':' is always the id separator.
    expect(parseOdooProjectFilters(['inst_a-B9:42'])).toEqual({
      projectsByInstance: [{ instanceId: 'inst_a-B9', projectIds: [42] }],
      includeNoProject: false
    })
  })

  it('keeps a malformed entry from widening the rest of the selection', () => {
    expect(parseOdooProjectFilters(['inst-a:7', 'garbage'])).toEqual({
      projectsByInstance: [{ instanceId: 'inst-a', projectIds: [7] }],
      includeNoProject: false
    })
  })
})

describe('retainResolvableOdooProjectFilters', () => {
  const project = { id: 7, name: 'Acme', instanceId: 'inst-a', instanceName: 'Acme SA' }

  it('drops only the entries this instance cannot resolve', () => {
    // A selection saved on another instance must lose that entry, not all of them.
    expect(retainResolvableOdooProjectFilters(['inst-a:7', 'inst-b:7'], [project])).toEqual([
      'inst-a:7'
    ])
  })

  it('always keeps the no-project sentinel, which resolves against nothing', () => {
    expect(retainResolvableOdooProjectFilters(['noProject'], [])).toEqual(['noProject'])
  })

  it('keeps a fully resolvable selection untouched', () => {
    expect(retainResolvableOdooProjectFilters(['inst-a:7'], [project])).toEqual(['inst-a:7'])
  })

  it('drops a value naming a project with no instance id', () => {
    expect(retainResolvableOdooProjectFilters([':7'], [{ id: 7, name: 'Acme' }])).toEqual([])
  })
})

describe('odooProjectFilterOptions', () => {
  const projects = [
    { id: 7, name: 'Acme', instanceId: 'inst-a', instanceName: 'Acme SA' },
    { id: 7, name: 'Acme', instanceId: 'inst-b', instanceName: 'Acme SAS' }
  ]

  it('keeps the id out of the searchable text', () => {
    // Every project of an instance shares that id, so matching on it matched all.
    expect(odooProjectFilterOptions(projects, false).map((option) => option.searchText)).toEqual([
      'Acme Acme SA',
      'Acme Acme SAS'
    ])
  })

  it('still gives same-named projects distinct values', () => {
    expect(odooProjectFilterOptions(projects, false).map((option) => option.value)).toEqual([
      'inst-a:7',
      'inst-b:7'
    ])
  })

  it('names the instance in the label only when several are connected', () => {
    expect(odooProjectFilterOptions(projects, false).map((option) => option.label)).toEqual([
      'Acme',
      'Acme'
    ])
    expect(odooProjectFilterOptions(projects, true).map((option) => option.label)).toEqual([
      'Acme (Acme SA)',
      'Acme (Acme SAS)'
    ])
  })

  it('drops a project no filter value can address', () => {
    expect(odooProjectFilterOptions([{ id: 7, name: 'Acme' }], false)).toEqual([])
  })

  it('leaves no trailing separator when the instance name is unknown', () => {
    const options = odooProjectFilterOptions([{ id: 7, name: 'Acme', instanceId: 'inst-a' }], false)
    expect(options.map((option) => option.searchText)).toEqual(['Acme'])
  })
})
