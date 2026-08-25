import { describe, expect, it } from 'vitest'

import {
  describeOdooAutoWorkspaceRunFault,
  describeOdooAutoWorkspaceSkip,
  groupOdooAutoWorkspaceSkips,
  odooAutoWorkspaceSkipKey
} from './odoo-auto-workspace-skip-report'

describe('groupOdooAutoWorkspaceSkips', () => {
  it('emits one notice per reason so an unrouted table is not one toast per ticket', () => {
    const { notices } = groupOdooAutoWorkspaceSkips(
      [
        { ticketId: 1, ref: '#1', reason: 'no-route' },
        { ticketId: 2, ref: '#2', reason: 'no-route' },
        { ticketId: 3, ref: '#3', reason: 'no-customer' }
      ],
      new Set()
    )

    expect(notices).toEqual([
      { reason: 'no-route', count: 2, refs: ['#1', '#2'] },
      { reason: 'no-customer', count: 1, refs: ['#3'] }
    ])
  })

  it('keeps the reasons distinct rather than collapsing them into one refusal', () => {
    const { notices } = groupOdooAutoWorkspaceSkips(
      [
        { ticketId: 1, ref: '#1', reason: 'no-customer' },
        { ticketId: 2, ref: '#2', reason: 'company-unresolved' },
        { ticketId: 3, ref: '#3', reason: 'no-route' },
        { ticketId: 4, ref: '#4', reason: 'repo-missing' },
        { ticketId: 5, ref: '#5', reason: 'repo-ambiguous' },
        { ticketId: 6, ref: '#6', reason: 'no-base-ref' }
      ],
      new Set()
    )

    expect(new Set(notices.map((notice) => notice.reason)).size).toBe(6)
    expect(
      new Set(notices.map((notice) => describeOdooAutoWorkspaceSkip(notice).message)).size
    ).toBe(6)
  })

  it('says nothing a second time for a ticket already reported that way', () => {
    const skips = [{ ticketId: 1, ref: '#1', reason: 'no-route' as const }]
    const first = groupOdooAutoWorkspaceSkips(skips, new Set())
    const second = groupOdooAutoWorkspaceSkips(skips, new Set(first.keys))

    expect(first.notices).toHaveLength(1)
    expect(second.notices).toEqual([])
  })

  it('reports the same ticket again when it fails a different way', () => {
    const reported = new Set([
      odooAutoWorkspaceSkipKey({ ticketId: 1, ref: '#1', reason: 'no-route' })
    ])
    const { notices } = groupOdooAutoWorkspaceSkips(
      [{ ticketId: 1, ref: '#1', reason: 'no-base-ref' }],
      reported
    )

    expect(notices.map((notice) => notice.reason)).toEqual(['no-base-ref'])
  })

  it('trails off past five refs instead of listing a whole filter', () => {
    const { notices } = groupOdooAutoWorkspaceSkips(
      Array.from({ length: 7 }, (_unused, index) => ({
        ticketId: index,
        ref: `#${index}`,
        reason: 'no-route' as const
      })),
      new Set()
    )

    expect(notices[0]?.refs).toHaveLength(5)
    expect(notices[0]?.count).toBe(7)
    expect(describeOdooAutoWorkspaceSkip(notices[0]!).description).toContain('2 more')
  })
})

describe('describeOdooAutoWorkspaceRunFault', () => {
  it('keys on the cause so one broken filter is announced once', () => {
    expect(describeOdooAutoWorkspaceRunFault('filter-missing', 'my tickets').key).toBe(
      'run:filter-missing:my tickets'
    )
    expect(describeOdooAutoWorkspaceRunFault('read-failed', 'boom').key).not.toBe(
      describeOdooAutoWorkspaceRunFault('read-failed', 'other').key
    )
  })
})
