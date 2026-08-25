import { describe, expect, it } from 'vitest'

import {
  ODOO_AUTO_WORKSPACE_INTERVAL_MS,
  shouldRunOdooAutoWorkspace
} from './odoo-auto-workspace-schedule'

const READY = {
  enabled: true,
  connected: true,
  windowVisible: true,
  running: false,
  lastRunAt: null,
  now: 1_000_000
}

describe('ODOO_AUTO_WORKSPACE_INTERVAL_MS', () => {
  it('is faster than the panel refresh but not a poll', () => {
    expect(ODOO_AUTO_WORKSPACE_INTERVAL_MS).toBe(15 * 60 * 1000)
    expect(ODOO_AUTO_WORKSPACE_INTERVAL_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
  })
})

describe('shouldRunOdooAutoWorkspace', () => {
  it('runs the first pass as soon as everything is ready', () => {
    expect(shouldRunOdooAutoWorkspace(READY)).toBe(true)
  })

  it.each([
    ['disarmed', { enabled: false }],
    ['disconnected', { connected: false }],
    ['hidden', { windowVisible: false }],
    ['already running', { running: true }]
  ])('stands down when %s', (_label, patch) => {
    expect(shouldRunOdooAutoWorkspace({ ...READY, ...patch })).toBe(false)
  })

  it('refuses a second pass inside the interval, so becoming visible is not a trigger', () => {
    expect(shouldRunOdooAutoWorkspace({ ...READY, lastRunAt: READY.now - 60_000 })).toBe(false)
  })

  it('runs again once the interval has elapsed', () => {
    expect(
      shouldRunOdooAutoWorkspace({
        ...READY,
        lastRunAt: READY.now - ODOO_AUTO_WORKSPACE_INTERVAL_MS
      })
    ).toBe(true)
  })
})
