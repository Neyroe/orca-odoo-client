import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  MAX_ODOO_ATTACHMENT_COUNT,
  ODOO_ATTACHMENT_UPLOAD_MAX_BASE64_LENGTH
} from '../../../../shared/odoo-attachment-upload-limit'
import { CURRENT_USER_TOKEN } from '../../../../shared/odoo-domain-tokens'
import {
  ODOO_DOMAIN_TOKENS_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES
} from '../../../../shared/protocol-version'
import { ODOO_METHODS } from './odoo'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function makeFile(dataLength: number): { name: string; mimetype: string; data: string } {
  return { name: 'note.txt', mimetype: 'text/plain', data: 'a'.repeat(dataLength) }
}

function makeRuntime(): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    odooUploadTicketAttachments: vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
    odooSearchTickets: vi.fn().mockResolvedValue([])
  } as unknown as OrcaRuntimeService
}

describe('odoo.uploadTicketAttachments params', () => {
  it('accepts a batch within the shared count and size caps', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ODOO_METHODS })
    const files = Array.from({ length: MAX_ODOO_ATTACHMENT_COUNT }, () => makeFile(8))

    await dispatcher.dispatch(makeRequest('odoo.uploadTicketAttachments', { ticketId: 7, files }))

    expect(runtime.odooUploadTicketAttachments).toHaveBeenCalledWith(7, files, undefined)
  })

  it('rejects more files than the composer can stage', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ODOO_METHODS })
    const files = Array.from({ length: MAX_ODOO_ATTACHMENT_COUNT + 1 }, () => makeFile(8))

    const response = await dispatcher.dispatch(
      makeRequest('odoo.uploadTicketAttachments', { ticketId: 7, files })
    )

    expect(response?.ok).toBe(false)
    expect(runtime.odooUploadTicketAttachments).not.toHaveBeenCalled()
  })

  it('rejects a payload over the size cap before it crosses the relay', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ODOO_METHODS })
    const files = [makeFile(ODOO_ATTACHMENT_UPLOAD_MAX_BASE64_LENGTH + 1)]

    const response = await dispatcher.dispatch(
      makeRequest('odoo.uploadTicketAttachments', { ticketId: 7, files })
    )

    expect(response?.ok).toBe(false)
    expect(runtime.odooUploadTicketAttachments).not.toHaveBeenCalled()
  })
})

describe('odoo.searchTickets params', () => {
  async function dispatch(domain: unknown): Promise<{
    runtime: OrcaRuntimeService
    response: Awaited<ReturnType<RpcDispatcher['dispatch']>>
  }> {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ODOO_METHODS })
    const response = await dispatcher.dispatch(makeRequest('odoo.searchTickets', { domain }))
    return { runtime, response }
  }

  it('accepts a balanced domain', async () => {
    const domain = ['|', ['name', 'ilike', 'x'], ['s_raf', '>', 0]]

    const { runtime, response } = await dispatch(domain)

    expect(response?.ok).toBe(true)
    expect(runtime.odooSearchTickets).toHaveBeenCalledWith(domain, undefined, undefined, undefined)
  })

  it('refuses an unbalanced domain with the reason, not an empty result', async () => {
    // The remote path never crosses src/main/ipc/odoo.ts, so it needs its own check.
    const { runtime, response } = await dispatch(['|', ['name', 'ilike', 'x']])

    expect(response?.ok).toBe(false)
    expect(response?.ok === false && response.error.message).toBe(
      'The "|" operator at position 0 is missing an operand.'
    )
    expect(runtime.odooSearchTickets).not.toHaveBeenCalled()
  })

  it('refuses a malformed leaf', async () => {
    const { runtime, response } = await dispatch([['name', '==', 'x']])

    expect(response?.ok === false && response.error.message).toBe(
      'The condition at position 0 uses an unknown operator "==".'
    )
    expect(runtime.odooSearchTickets).not.toHaveBeenCalled()
  })

  it('still accepts the empty match-all domain', async () => {
    const { runtime, response } = await dispatch([])

    expect(response?.ok).toBe(true)
    expect(runtime.odooSearchTickets).toHaveBeenCalledWith([], undefined, undefined, undefined)
  })
})

describe('odoo.searchTickets across client versions', () => {
  async function dispatch(domain: unknown): Promise<{
    runtime: OrcaRuntimeService
    response: Awaited<ReturnType<RpcDispatcher['dispatch']>>
  }> {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ODOO_METHODS })
    const response = await dispatcher.dispatch(makeRequest('odoo.searchTickets', { domain }))
    return { runtime, response }
  }

  it('advertises the token capability so a newer client can negotiate', () => {
    expect(RUNTIME_CAPABILITIES).toContain(ODOO_DOMAIN_TOKENS_RUNTIME_CAPABILITY)
  })

  it('serves an older client, whose domain can never carry a token', async () => {
    // Old client -> new host: the client predates the `$orca:` namespace, so the
    // new capability is inert for it and nothing about its read changes.
    const domain = [['name', 'ilike', 'invoice']]

    const { runtime, response } = await dispatch(domain)

    expect(response?.ok).toBe(true)
    expect(runtime.odooSearchTickets).toHaveBeenCalledWith(domain, undefined, undefined, undefined)
  })

  it('takes a token domain unresolved, leaving the per-instance uid to the read', async () => {
    const domain = [['user_ids', 'in', [CURRENT_USER_TOKEN]]]

    const { runtime, response } = await dispatch(domain)

    expect(response?.ok).toBe(true)
    expect(runtime.odooSearchTickets).toHaveBeenCalledWith(domain, undefined, undefined, undefined)
  })

  it('refuses a token outside the known set even from a negotiated client', async () => {
    const { runtime, response } = await dispatch([['user_ids', 'in', ['$orca:mee']]])

    expect(response?.ok === false && response.error.message).toBe(
      'The condition at position 0 uses an unknown Orca token "$orca:mee".'
    )
    expect(runtime.odooSearchTickets).not.toHaveBeenCalled()
  })
})
