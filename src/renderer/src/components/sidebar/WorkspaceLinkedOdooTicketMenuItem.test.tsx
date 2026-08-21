// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceLinkedOdooTicketMenuItem } from './WorkspaceLinkedOdooTicketMenuItem'
import type { OdooTicket } from '../../../../shared/odoo-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { Worktree } from '../../../../shared/worktree/types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  fetchOdooTicket: vi.fn<() => Promise<OdooTicket | null>>(),
  openTaskPage: vi.fn(),
  openUrl: vi.fn()
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
      fallback
    )
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  )
}))

const storeState = {
  odooStatus: { connected: true, viewer: null },
  fetchOdooTicket: mocks.fetchOdooTicket,
  openTaskPage: mocks.openTaskPage
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
}))

const sourceContext = { provider: 'odoo' } as unknown as TaskSourceContext

function worktree(overrides: Partial<Worktree>): Worktree {
  return { ...(overrides as Worktree) }
}

const linkedWorktree = worktree({
  linkedOdooTicket: 45514,
  linkedOdooInstanceId: 'prod',
  linkedTaskSourceContext: sourceContext,
  linkedWorkItem: {
    provider: 'odoo',
    type: 'issue',
    number: 45514,
    title: 'Connecteur EDI',
    url: 'https://odoo.example/odoo/project/1/tasks/45514',
    odooInstanceId: 'prod'
  }
})

const ticket = { id: 45514, ref: '#45514', instanceId: 'prod' } as OdooTicket

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mocks.toast.mockReset()
  mocks.fetchOdooTicket.mockReset()
  mocks.openTaskPage.mockReset()
  mocks.openUrl.mockReset()
  storeState.odooStatus = { connected: true, viewer: null }
  Object.assign(globalThis, { window: globalThis.window })
  ;(window as unknown as { api: unknown }).api = { shell: { openUrl: mocks.openUrl } }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

async function render(target: Worktree): Promise<void> {
  await act(async () => root.render(<WorkspaceLinkedOdooTicketMenuItem worktree={target} />))
}

function item(): HTMLButtonElement | null {
  return container.querySelector('button')
}

describe('WorkspaceLinkedOdooTicketMenuItem', () => {
  it('stays out of the menu for a workspace with no Odoo link', async () => {
    await render(worktree({ linkedIssue: 12 }))
    expect(item()).toBeNull()
  })

  it('reads the ticket through its own instance and source identity', async () => {
    mocks.fetchOdooTicket.mockResolvedValue(ticket)
    await render(linkedWorktree)

    expect(item()?.textContent).toContain('Open Odoo ticket #45514')
    await act(async () => {
      item()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.fetchOdooTicket).toHaveBeenCalledWith(45514, 'prod', { sourceContext })
    expect(mocks.openTaskPage).toHaveBeenCalledWith({
      taskSource: 'odoo',
      openOdooTicket: ticket
    })
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('opens a folder workspace ticket, whose link is only a work item', async () => {
    mocks.fetchOdooTicket.mockResolvedValue(ticket)
    await render(
      worktree({
        linkedWorkItem: {
          provider: 'odoo',
          type: 'issue',
          number: 4,
          title: 'Private todo',
          url: 'https://odoo.example/odoo/project/tasks/4',
          odooInstanceId: 'staging'
        }
      })
    )

    await act(async () => {
      item()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.fetchOdooTicket).toHaveBeenCalledWith(4, 'staging', { sourceContext: null })
  })

  it('offers the stored ticket and its browser link while Odoo is disconnected', async () => {
    storeState.odooStatus = { connected: false, viewer: null }
    await render(linkedWorktree)

    await act(async () => {
      item()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.fetchOdooTicket).not.toHaveBeenCalled()
    expect(mocks.openTaskPage).not.toHaveBeenCalled()
    const [title, options] = mocks.toast.mock.calls[0] as [
      string,
      { action?: { onClick: () => void } }
    ]
    expect(title).toBe('Connecteur EDI')
    options.action?.onClick()
    expect(mocks.openUrl).toHaveBeenCalledWith('https://odoo.example/odoo/project/1/tasks/45514')
  })

  it('degrades to the stored ticket when the read comes back empty', async () => {
    mocks.fetchOdooTicket.mockResolvedValue(null)
    await render(linkedWorktree)

    await act(async () => {
      item()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.openTaskPage).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })

  it('degrades when the read fails outright', async () => {
    mocks.fetchOdooTicket.mockRejectedValue(new Error('relay down'))
    await render(linkedWorktree)

    await act(async () => {
      item()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.openTaskPage).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })
})
