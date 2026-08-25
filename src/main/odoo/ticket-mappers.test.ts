import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OdooClientForInstance } from './json-rpc'

const mocks = vi.hoisted(() => ({ executeKw: vi.fn() }))

vi.mock('./json-rpc', () => ({ executeKw: mocks.executeKw }))

const {
  base64ImageDataUri,
  loadLookups,
  mapCommentAttachments,
  mapMentionSuggestion,
  mapStage,
  mapTicket,
  mapUser,
  toIsoDate
} = await import('./ticket-mappers')

describe('toIsoDate', () => {
  it('turns a naive Odoo datetime into a UTC ISO string', () => {
    expect(toIsoDate('2026-08-14 09:30:00')).toBe('2026-08-14T09:30:00Z')
  })

  it('adds midnight to a date-only value so the result stays parseable', () => {
    // `date_deadline` is a Date field: `2026-08-14Z` alone is not RFC 3339.
    expect(toIsoDate('2026-08-14')).toBe('2026-08-14T00:00:00Z')
    expect(Number.isNaN(new Date(toIsoDate('2026-08-14')).getTime())).toBe(false)
  })

  it('leaves an already-ISO value alone', () => {
    expect(toIsoDate('2026-08-14T09:30:00Z')).toBe('2026-08-14T09:30:00Z')
  })

  it('falls back to the epoch for Odoo `false`', () => {
    expect(toIsoDate(false)).toBe(new Date(0).toISOString())
  })
})

describe('base64ImageDataUri', () => {
  it('labels an Odoo SVG placeholder as svg+xml, not png', () => {
    // Real Odoo avatar_128 placeholders are base64 of `<?xml …` (prefix PD94).
    // Mislabeling them as PNG makes the browser refuse to render the avatar.
    expect(base64ImageDataUri('PD94bWwgdmVyc2lvbj0=')).toBe(
      'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0='
    )
    expect(base64ImageDataUri('PHN2ZyB4bWxucz0=')).toBe(
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0='
    )
  })

  it('detects png, jpeg, and gif containers from the base64 prefix', () => {
    expect(base64ImageDataUri('iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(base64ImageDataUri('/9j/4AAQSkZJRg==')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==')
    expect(base64ImageDataUri('R0lGODdh')).toBe('data:image/gif;base64,R0lGODdh')
  })

  it('returns undefined for empty or non-string values (Odoo `false`)', () => {
    expect(base64ImageDataUri(false)).toBeUndefined()
    expect(base64ImageDataUri('')).toBeUndefined()
    expect(base64ImageDataUri(null)).toBeUndefined()
  })
})

describe('mapStage', () => {
  it('carries the kanban color index and folds', () => {
    expect(mapStage({ id: 9, name: 'En cours', sequence: 2, fold: false, color: 4 })).toEqual({
      id: 9,
      name: 'En cours',
      sequence: 2,
      fold: false,
      color: 4
    })
  })

  it('leaves color undefined when Odoo returns a non-number', () => {
    expect(
      mapStage({ id: 1, name: 'Inbox', sequence: 0, fold: false, color: false }).color
    ).toBeUndefined()
  })
})

describe('mapUser', () => {
  it('builds an avatar data URI when avatar_128 is present', () => {
    const user = mapUser({
      id: 2,
      name: 'Administrator',
      login: 'admin',
      avatar_128: 'iVBORw0KGgo='
    })
    expect(user.avatarUrl).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(user.displayName).toBe('Administrator')
  })

  it('omits avatarUrl when the record has no image', () => {
    expect(
      mapUser({ id: 5, name: 'Dev', login: 'dev', avatar_128: false }).avatarUrl
    ).toBeUndefined()
  })
})

describe('mapCommentAttachments', () => {
  const serverUrl = 'https://example.odoo.com'

  it('resolves each id against the batch-read lookup and builds a download URL', () => {
    const attachmentsById = new Map([
      [10, { name: 'spec.pdf', mimetype: 'application/pdf' }],
      [11, { name: 'shot.png', mimetype: 'image/png' }]
    ])
    expect(mapCommentAttachments([10, 11], attachmentsById, serverUrl)).toEqual([
      {
        id: 10,
        name: 'spec.pdf',
        mimetype: 'application/pdf',
        url: 'https://example.odoo.com/web/content/10?download=true'
      },
      {
        id: 11,
        name: 'shot.png',
        mimetype: 'image/png',
        url: 'https://example.odoo.com/web/content/11?download=true'
      }
    ])
  })

  it('skips ids missing from the lookup rather than throwing', () => {
    const attachmentsById = new Map([[10, { name: 'spec.pdf', mimetype: 'application/pdf' }]])
    expect(mapCommentAttachments([10, 999], attachmentsById, serverUrl)).toEqual([
      {
        id: 10,
        name: 'spec.pdf',
        mimetype: 'application/pdf',
        url: 'https://example.odoo.com/web/content/10?download=true'
      }
    ])
  })

  it('falls back to the numeric id as name when the attachment carries none', () => {
    const attachmentsById = new Map([[10, {}]])
    expect(mapCommentAttachments([10], attachmentsById, serverUrl)[0]?.name).toBe('10')
  })
})

describe('mapMentionSuggestion', () => {
  // Odoo returns partner_id as [id, display_name], and display_name carries the
  // company prefix. The composer inserts the label verbatim as `@<name>`, so the
  // prefix must not reach it.
  const marc = {
    id: 5,
    name: 'Marc Demo',
    login: 'marc',
    partner_id: [9, 'YourCompany, Marc Demo']
  }

  it('labels the candidate with the plain user name, not the partner display name', () => {
    expect(mapMentionSuggestion(marc, new Map())).toEqual({
      id: 9,
      name: 'Marc Demo',
      login: 'marc',
      avatarUrl: undefined
    })
  })

  it('attaches the partner avatar when one was read', () => {
    expect(
      mapMentionSuggestion(marc, new Map([[9, 'data:image/png;base64,iVBORw0KGgo=']]))
    ).toEqual({
      id: 9,
      name: 'Marc Demo',
      login: 'marc',
      avatarUrl: 'data:image/png;base64,iVBORw0KGgo='
    })
  })

  it('falls back to the partner display name when the user has none', () => {
    expect(mapMentionSuggestion({ ...marc, name: false }, new Map())?.name).toBe(
      'YourCompany, Marc Demo'
    )
  })

  it('drops a user with no partner, since partner_ids is what a mention needs', () => {
    expect(mapMentionSuggestion({ ...marc, partner_id: false }, new Map())).toBeNull()
  })
})

describe('customer company resolution', () => {
  const client = {
    instance: {
      id: 'alpha',
      serverUrl: 'https://alpha.odoo.com',
      database: 'alpha',
      login: 'admin',
      uid: 2,
      displayName: 'Alpha'
    },
    apiKey: 'k'
  } as OdooClientForInstance

  /** A search_read row: only `partner_id` matters to the partner lookup. */
  function row(id: number, partnerId: unknown): Record<string, unknown> {
    return { id, name: `Task ${id}`, partner_id: partnerId }
  }

  beforeEach(() => {
    mocks.executeKw.mockReset()
  })

  it('resolves the contact to its commercial partner', async () => {
    // Real shape: partner_id is a contact whose display_name carries the company.
    mocks.executeKw.mockResolvedValueOnce([
      { id: 41170, commercial_partner_id: [1633, 'CAM - NOVACEL'] }
    ])

    const rows = [row(1, [41170, 'CAM - NOVACEL, Helene Mannina'])]
    const lookups = await loadLookups(client, rows)
    const ticket = mapTicket(client, rows[0], lookups)

    expect(ticket.customer).toEqual({ id: 41170, name: 'CAM - NOVACEL, Helene Mannina' })
    expect(ticket.customerCompany).toEqual({ id: 1633, name: 'CAM - NOVACEL' })
  })

  it('maps a partner that is itself a company to itself', async () => {
    mocks.executeKw.mockResolvedValueOnce([
      { id: 46951, commercial_partner_id: [46951, 'NUTRIPURE'] }
    ])

    const rows = [row(1, [46951, 'NUTRIPURE'])]
    const ticket = mapTicket(client, rows[0], await loadLookups(client, rows))

    expect(ticket.customerCompany).toEqual({ id: 46951, name: 'NUTRIPURE' })
  })

  it('reads every distinct partner of the page in one call', async () => {
    mocks.executeKw.mockResolvedValueOnce([
      { id: 41170, commercial_partner_id: [1633, 'CAM - NOVACEL'] },
      { id: 49088, commercial_partner_id: [49072, 'LABORATOIRES HUMEAU'] }
    ])

    const rows = [
      row(1, [41170, 'CAM - NOVACEL, Helene Mannina']),
      row(2, [49088, 'LABORATOIRES HUMEAU, Vincent Perrinet']),
      row(3, [41170, 'CAM - NOVACEL, Helene Mannina'])
    ]
    const lookups = await loadLookups(client, rows)

    expect(mocks.executeKw).toHaveBeenCalledTimes(1)
    const [, model, method, args] = mocks.executeKw.mock.calls[0]
    expect(model).toBe('res.partner')
    expect(method).toBe('search_read')
    expect(args).toEqual([[['id', 'in', [41170, 49088]]]])
    expect(rows.map((raw) => mapTicket(client, raw, lookups).customerCompany?.id)).toEqual([
      1633, 49072, 1633
    ])
  })

  it('spends no round trip when no ticket carries a customer', async () => {
    // `partner_id` is `false` on planning tasks; an unguarded read here would
    // also hit the network in tickets.test.ts, which only mocks ./client.
    const rows = [row(1, false), row(2, false)]
    const ticket = mapTicket(client, rows[0], await loadLookups(client, rows))

    expect(mocks.executeKw).not.toHaveBeenCalled()
    expect(ticket.customer).toBeUndefined()
    expect(ticket.customerCompany).toBeUndefined()
  })

  it('keeps the customer when the partner read is refused by ACL', async () => {
    mocks.executeKw.mockRejectedValueOnce(new Error('AccessError'))

    const rows = [row(1, [41170, 'CAM - NOVACEL, Helene Mannina'])]
    const ticket = mapTicket(client, rows[0], await loadLookups(client, rows))

    expect(ticket.customer?.id).toBe(41170)
    expect(ticket.customerCompany).toBeUndefined()
  })

  it('drops a partner the read did not return, and one with no commercial partner', async () => {
    mocks.executeKw.mockResolvedValueOnce([{ id: 41170, commercial_partner_id: false }])

    const rows = [row(1, [41170, 'Contact']), row(2, [99999, 'Hidden'])]
    const lookups = await loadLookups(client, rows)

    expect(mapTicket(client, rows[0], lookups).customerCompany).toBeUndefined()
    expect(mapTicket(client, rows[1], lookups).customerCompany).toBeUndefined()
  })
})
