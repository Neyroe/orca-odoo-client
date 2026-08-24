// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { readStoreListenerCount } from '@/store/store-listener-census'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { OdooTicket } from '../../../../shared/odoo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { usePromptCacheCountdownStartedAt } from './CacheTimer'
import { useWorktreeCardSecondaryDetails } from './use-worktree-card-secondary-details'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'

const WORKTREE_ID = 'repo-1::/repo/worktrees/card'
const originalState = useAppStore.getState()

let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(node: ReactNode): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
}

function unmount(): void {
  if (root) {
    act(() => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
}

function listenerCount(): number {
  const count = readStoreListenerCount()
  if (count === null) {
    throw new Error('store listener census unavailable')
  }
  return count
}

function makeWorktree(): Worktree {
  return {
    id: WORKTREE_ID,
    repoId: 'repo-1',
    path: '/repo/worktrees/card',
    displayName: 'Card',
    branch: 'feature/card',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1
  }
}

function makeSettings(promptCacheTtlMs: number): GlobalSettings {
  return { promptCacheTimerEnabled: true, promptCacheTtlMs } as GlobalSettings
}

function secondaryDetailsArgs(settings: GlobalSettings) {
  return {
    worktree: makeWorktree(),
    repo: undefined,
    statusPrDisplay: null,
    showStatus: false,
    showIssue: false,
    showLinearIssue: false,
    showJiraIssue: false,
    showOdooTicket: false,
    showPR: false,
    showAutomation: false,
    showCli: false,
    showComment: false,
    showPorts: false,
    issueDisplay: null,
    linearIssue: null,
    linearIssueDisplay: null,
    jiraIssueDisplay: null,
    odooTicket: null,
    odooTicketDisplay: null,
    prDisplay: null,
    linkedGitLabMR: null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    cardProps: [] as never,
    newCardStyle: false,
    compactCards: false,
    agentActivityDisplayMode: 'compact' as const,
    workspacePorts: [],
    openTaskPage: (() => {}) as never,
    updateWorktreeMeta: (() => {}) as never,
    settings
  }
}

afterEach(() => {
  unmount()
  useAppStore.setState(originalState, true)
})

describe('useWorktreeCardSecondaryDetails store subscriptions', () => {
  it('adds no store listener of its own beyond the hooks it composes', () => {
    const settings = makeSettings(300_000)

    // Baseline: the two hooks it composes, mounted on their own.
    const composedBaseline = listenerCount()
    function ComposedProbe(): null {
      useWorktreeAgentRows(WORKTREE_ID, false)
      usePromptCacheCountdownStartedAt(WORKTREE_ID, true)
      return null
    }
    mount(<ComposedProbe />)
    const composedListeners = listenerCount() - composedBaseline
    unmount()

    const baseline = listenerCount()
    function Probe(): null {
      useWorktreeCardSecondaryDetails(secondaryDetailsArgs(settings))
      return null
    }
    mount(<Probe />)

    // Why: promptCacheTtlMs comes from the settings the card already subscribes to,
    // so this hook must not open a third subscription for the same field.
    expect(listenerCount() - baseline).toBe(composedListeners)

    unmount()
    expect(listenerCount()).toBe(baseline)
  })

  it('reads the cache TTL from the passed settings', () => {
    let cacheTtlMs = -1
    function Probe({ ttl }: { ttl: number }): null {
      cacheTtlMs = useWorktreeCardSecondaryDetails(
        secondaryDetailsArgs(makeSettings(ttl))
      ).cacheTtlMs
      return null
    }

    mount(<Probe ttl={300_000} />)
    expect(cacheTtlMs).toBe(300_000)

    act(() => root?.render(<Probe ttl={120_000} />))
    expect(cacheTtlMs).toBe(120_000)
  })

  // Regression: the Odoo ticket was missing from the hover-details check, so a
  // workspace linked only to Odoo rendered no badge row and no hover card —
  // which is where "Open in Orca" lives.
  it('has hover details for a workspace linked only to an Odoo ticket', () => {
    let hasDetails = false
    let badgeRef: string | undefined
    let openHandler: unknown
    function Probe(): null {
      const details = useWorktreeCardSecondaryDetails({
        ...secondaryDetailsArgs(makeSettings(300_000)),
        showOdooTicket: true,
        odooTicket: { id: 47585, ref: '#47585' } as OdooTicket,
        odooTicketDisplay: {
          ref: '#47585',
          title: 'Gestion des livraisons amazon',
          url: 'https://odoo.example/odoo/project/1/tasks/47585'
        }
      })
      hasDetails = details.hasDetails
      badgeRef = details.metaOdooTicket?.ref
      openHandler = details.handleOpenOdooTicketInOrca
      return null
    }

    mount(<Probe />)
    expect(hasDetails).toBe(true)
    expect(badgeRef).toBe('#47585')
    expect(typeof openHandler).toBe('function')
  })

  it('reports no TTL while the aggregate cache timer is suppressed', () => {
    let cacheTtlMs = -1
    function Probe(): null {
      // compactCards suppresses the aggregate timer row.
      cacheTtlMs = useWorktreeCardSecondaryDetails({
        ...secondaryDetailsArgs(makeSettings(300_000)),
        compactCards: true
      }).cacheTtlMs
      return null
    }

    mount(<Probe />)
    expect(cacheTtlMs).toBe(0)
  })

  it('reports hasDetails when an Odoo ticket is the only linked detail, on the default card style', () => {
    let hasDetails: boolean | null = null
    function Probe(): null {
      // newCardStyle: false is the default card style, not the experimental one.
      hasDetails = useWorktreeCardSecondaryDetails({
        ...secondaryDetailsArgs(makeSettings(300_000)),
        showOdooTicket: true,
        odooTicketDisplay: { ref: 'TASK-72', title: 'Chatter attachments' },
        newCardStyle: false
      }).hasDetails
      return null
    }

    mount(<Probe />)
    expect(hasDetails).toBe(true)
  })
})
