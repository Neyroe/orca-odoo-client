/**
 * Live proof for the "Start workspace from ticket" button's own path.
 *
 * `developer-cycle-live-proof.test.ts` links a worktree through
 * `WorktreeMeta.linkedOdooTicket`. The button does not use that field: it hands
 * the composer a `WorkspaceLinkedItem`, which `worktrees:create` parses with
 * `WorkspaceLinkedItemSchema`. That second path had no proof, which is how a
 * provider check missing 'odoo' shipped while the ticket-id path stayed green.
 *
 * Opt-in and credential-free: set ODOO_PROOF_URL / _DB / _LOGIN / _KEY against a
 * disposable instance. Unset, the suite skips so CI stays green.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Same shape as live-proof.test.ts: the Odoo transport only touches
// session.defaultSession to configure a proxy, which a direct localhost call
// does not need, and net.fetch is API-compatible with the global.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/proof-linked-item' },
  session: { defaultSession: undefined },
  net: { fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init) },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v),
    decryptString: (b: Buffer) => b.toString()
  }
}))

import { connect, getClients } from './client'
import { getTicket } from './tickets'
import { WorktreeCreate } from '../runtime/rpc/methods/worktree-schemas'
import { bindTaskPageOdooItemSourceContext } from '../../renderer/src/components/task-page-odoo-item-source-context'
import { TaskSourceContextSchema } from '../../shared/task-source-context-schema'
import {
  areWorkspaceLinkedItemsEqual,
  normalizeWorkspaceLinkedItem
} from '../../shared/workspace-linked-item'
import { WorkspaceLinkedItemSchema } from '../../shared/workspace-linked-item-schema'
import { isWorkspaceLinkedItemSourceContextMatch } from '../../shared/workspace-linked-item-source-context'
import type { OdooInstance } from '../../shared/odoo-types'
import type { WorkspaceLinkedItem } from '../../shared/worktree/types'

const CHILD_TICKET_ID = Number(process.env.ODOO_PROOF_CHILD_TICKET ?? '80')

const LIVE = Boolean(process.env.ODOO_PROOF_URL)

let instance: OdooInstance

describe.skipIf(!LIVE)('Odoo start-workspace linked item', () => {
  beforeAll(async () => {
    const result = await connect({
      serverUrl: process.env.ODOO_PROOF_URL as string,
      database: process.env.ODOO_PROOF_DB as string,
      login: process.env.ODOO_PROOF_LOGIN as string,
      apiKey: process.env.ODOO_PROOF_KEY as string
    })
    expect(result.ok, `connect failed: ${result.ok ? '' : result.error}`).toBe(true)
    const clients = getClients()
    expect(clients.length).toBeGreaterThan(0)
    instance = clients[0].instance
  }, 90_000)

  it('survives every gate worktrees:create puts in front of a linked work item', async () => {
    const ticket = await getTicket(CHILD_TICKET_ID)
    expect(ticket, 'child ticket not readable').not.toBeNull()
    if (!ticket) {
      return
    }
    // The server, not the test, supplies the id/ref/title/url the button reads.
    expect(ticket.instanceId).toBe(instance.id)
    expect(ticket.url).toContain(String(CHILD_TICKET_ID))

    // From here on this is OdooTicketStartWorkspaceButton.startWorkspace verbatim.
    const taskSourceContext = bindTaskPageOdooItemSourceContext({
      ticket,
      instances: [instance],
      settings: { activeRuntimeEnvironmentId: null }
    })
    expect(taskSourceContext, 'button refuses to link without a source context').not.toBeNull()
    if (!taskSourceContext) {
      return
    }
    const resolvedInstanceId =
      taskSourceContext.providerIdentity?.provider === 'odoo'
        ? (taskSourceContext.providerIdentity.instanceId ?? undefined)
        : undefined
    const linkedWorkItem: WorkspaceLinkedItem = {
      provider: 'odoo',
      type: 'issue',
      number: ticket.id,
      title: `${ticket.ref} ${ticket.title}`,
      url: ticket.url,
      odooInstanceId: resolvedInstanceId
    }
    expect(resolvedInstanceId).toBe(instance.id)

    const normalized = normalizeWorkspaceLinkedItem(linkedWorkItem)
    expect(normalized, 'normalizer dropped the Odoo item').not.toBeNull()
    expect(normalized?.number).toBe(ticket.id)
    expect(normalized?.odooInstanceId).toBe(instance.id)

    // Gate 1 — the schema `worktrees:create` parses `linkedWorkItem` with; the
    // one that raised "Invalid linked work item" for every Odoo ticket.
    const parsedItem = WorkspaceLinkedItemSchema.safeParse(linkedWorkItem)
    expect(
      parsedItem.success,
      parsedItem.success ? '' : JSON.stringify(parsedItem.error.issues)
    ).toBe(true)
    expect(parsedItem.success && parsedItem.data.odooInstanceId).toBe(instance.id)

    // Gate 2 — the sibling parse and identity cross-check in the same handler.
    const parsedContext = TaskSourceContextSchema.safeParse(taskSourceContext)
    expect(
      parsedContext.success,
      parsedContext.success ? '' : JSON.stringify(parsedContext.error.issues)
    ).toBe(true)
    expect(
      parsedItem.success &&
        parsedContext.success &&
        isWorkspaceLinkedItemSourceContextMatch(parsedItem.data, parsedContext.data)
    ).toBe(true)

    // Gate 3 — the same create over RPC, which remote and CLI clients take.
    const parsedCreate = WorktreeCreate.safeParse({
      repo: 'odoo-proof-repo',
      name: `ticket-${ticket.id}`,
      linkedWorkItem,
      linkedTaskSourceContext: taskSourceContext,
      telemetrySource: 'sidebar'
    })
    expect(
      parsedCreate.success,
      parsedCreate.success ? '' : JSON.stringify(parsedCreate.error.issues)
    ).toBe(true)
    expect(parsedCreate.success && parsedCreate.data.linkedWorkItem?.odooInstanceId).toBe(
      instance.id
    )

    // The instance has to be load-bearing, or carrying it through proves nothing:
    // the same ticket number on another instance is a different work item.
    expect(
      areWorkspaceLinkedItemsEqual(parsedItem.success ? parsedItem.data : null, {
        ...linkedWorkItem,
        odooInstanceId: `${instance.id}-other`
      })
    ).toBe(false)
    // And a provider the product does not know must still be refused.
    expect(
      WorkspaceLinkedItemSchema.safeParse({ ...linkedWorkItem, provider: 'bitbucket' }).success
    ).toBe(false)

    console.log(
      'LINKED ITEM PROOF',
      JSON.stringify({
        server: instance.serverUrl,
        database: instance.database,
        instanceId: instance.id,
        ticket: { id: ticket.id, ref: ticket.ref, title: ticket.title, url: ticket.url },
        parsedLinkedWorkItem: parsedCreate.success ? parsedCreate.data.linkedWorkItem : null,
        sourceContextProvider: parsedContext.success ? parsedContext.data.provider : null
      })
    )
  }, 90_000)
})
