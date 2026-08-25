import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS,
  ODOO_AUTO_WORKSPACE_MAX_PER_RUN,
  parseOdooAutoWorkspaceSettings
} from './odoo-auto-workspace-settings'

describe('parseOdooAutoWorkspaceSettings', () => {
  it('falls back to the disabled default for missing or malformed payloads', () => {
    expect(parseOdooAutoWorkspaceSettings(null)).toEqual(DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS)
    expect(parseOdooAutoWorkspaceSettings('not json')).toEqual(DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS)
    expect(parseOdooAutoWorkspaceSettings('[]')).toEqual(DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS)
  })

  it('refuses to look armed without a saved filter', () => {
    const parsed = parseOdooAutoWorkspaceSettings(JSON.stringify({ enabled: true }))
    expect(parsed.enabled).toBe(false)
    expect(parsed.savedFilterId).toBeNull()
  })

  it('treats a blank filter id as no filter', () => {
    const parsed = parseOdooAutoWorkspaceSettings(
      JSON.stringify({ enabled: true, savedFilterId: '   ' })
    )
    expect(parsed.savedFilterId).toBeNull()
    expect(parsed.enabled).toBe(false)
  })

  it('trims a padded filter id', () => {
    const parsed = parseOdooAutoWorkspaceSettings(
      JSON.stringify({ enabled: true, savedFilterId: '  my tickets  ' })
    )
    expect(parsed.savedFilterId).toBe('my tickets')
    expect(parsed.enabled).toBe(true)
  })

  it('drops the retired repo, base branch and criteria fields', () => {
    const parsed = parseOdooAutoWorkspaceSettings(
      JSON.stringify({
        enabled: true,
        savedFilterId: 'my tickets',
        repoId: 'repo-1',
        baseBranch: 'release',
        criteria: { assignedToMe: true, priorities: ['3'] },
        maxPerRun: 2
      })
    )
    expect(parsed).toEqual({ enabled: true, savedFilterId: 'my tickets', maxPerRun: 2 })
  })

  it('clamps the per-run cap to the hard ceiling', () => {
    const parsed = parseOdooAutoWorkspaceSettings(
      JSON.stringify({ enabled: true, savedFilterId: 'f', maxPerRun: 999 })
    )
    expect(parsed.maxPerRun).toBe(ODOO_AUTO_WORKSPACE_MAX_PER_RUN)
  })

  it('keeps a non-integer cap at the default rather than disarming or unbounding it', () => {
    const parsed = parseOdooAutoWorkspaceSettings(
      JSON.stringify({ savedFilterId: 'f', maxPerRun: 'many' })
    )
    expect(parsed.maxPerRun).toBe(DEFAULT_ODOO_AUTO_WORKSPACE_SETTINGS.maxPerRun)
  })
})
