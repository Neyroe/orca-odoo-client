import { describe, expect, it } from 'vitest'

import { findOdooRepoRouteOption, odooRepoRouteOptions } from './odoo-customer-repo-route-options'
import type { Repo } from '../../../shared/repo-types'

const repo = (id: string, displayName: string, executionHostId?: string): Repo =>
  ({
    id,
    displayName,
    path: `/repos/${id}`,
    badgeColor: '#000',
    addedAt: 0,
    ...(executionHostId ? { executionHostId } : {})
  }) as Repo

describe('odooRepoRouteOptions', () => {
  it('keys on the host-qualified identity, not the bare repo id', () => {
    // `repos` is a cross-host union: the same id names two repos, and a bare-id
    // option would silently route to whichever sorted first.
    const options = odooRepoRouteOptions([
      repo('humeau', 'humeau'),
      repo('humeau', 'humeau', 'ssh:box')
    ])

    expect(new Set(options.map((option) => option.value)).size).toBe(2)
  })

  it('names the host only when the display name is ambiguous', () => {
    const options = odooRepoRouteOptions([
      repo('humeau', 'humeau'),
      repo('humeau', 'humeau', 'ssh:box'),
      repo('nutri', 'odoo-nutripure')
    ])

    expect(options.find((option) => option.repo.id === 'nutri')?.label).toBe('odoo-nutripure')
    expect(options.filter((option) => option.label.startsWith('humeau (')).length).toBe(2)
  })

  it('sorts by label', () => {
    const options = odooRepoRouteOptions([repo('b', 'zeta'), repo('a', 'alpha')])

    expect(options.map((option) => option.label)).toEqual(['alpha', 'zeta'])
  })
})

describe('findOdooRepoRouteOption', () => {
  const options = odooRepoRouteOptions([
    repo('humeau', 'humeau'),
    repo('humeau', 'humeau', 'ssh:box')
  ])

  it('picks the repo on the host the row names', () => {
    const found = findOdooRepoRouteOption(options, {
      repoId: 'humeau',
      executionHostId: 'ssh:box'
    })

    expect(found?.repo.executionHostId).toBe('ssh:box')
  })

  it('answers null when the row names a host that is gone', () => {
    // The row still exists but routes nowhere; the editor has to say so rather
    // than fall back to the same id on another machine.
    expect(
      findOdooRepoRouteOption(options, { repoId: 'humeau', executionHostId: 'ssh:retired' })
    ).toBeNull()
  })
})
