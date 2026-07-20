import { describe, expect, it } from 'vitest'
import { base64ImageDataUri, mapStage, mapUser } from './ticket-mappers'

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
