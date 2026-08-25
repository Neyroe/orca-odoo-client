import type {
  OdooComment,
  OdooConnectionStatus,
  OdooCreateTicketArgs,
  OdooCreateTicketResult,
  OdooInstanceSelection,
  OdooMutationResult,
  OdooProject,
  OdooProjectScope,
  OdooStage,
  OdooTag,
  OdooTicket,
  OdooTicketUpdate,
  OdooUser,
  OdooViewer
} from '../../../shared/odoo-types'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import { assertCurrentUserTokenSupported } from './runtime-odoo-domain-token-support'
import { ODOO_PROJECT_SCOPE_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { RuntimeClientTarget } from './runtime-client-target'
import { isRuntimeProviderSearchQueryWithinLimit } from './runtime-provider-search-bounds'
import { getOdooRuntimeTarget, type RuntimeOdooSettings } from './odoo-runtime-target'

// Why re-exported here: chatter-specific transport (edit/mention-search/upload)
// lives in its own module to keep this file under the max-lines budget, but
// callers should still import every `odooX` function from this one contract file.
export {
  odooSearchMentionCandidates,
  odooUpdateTicketComment,
  odooUploadTicketAttachments
} from './runtime-odoo-chatter-client'
// The guard itself stays internal, like `assertProjectScopeSupported`: callers
// negotiate by going through `odooSearchTickets`, never by asserting themselves.
export {
  isOdooCurrentUserTokenUnsupportedError,
  OdooCurrentUserTokenUnsupportedError
} from './runtime-odoo-domain-token-support'
export { odooUpdateApiKey, type OdooUpdatableInstance } from './runtime-odoo-credential-client'
export { getOdooRuntimeTarget, type RuntimeOdooSettings } from './odoo-runtime-target'

export type OdooConnectResult = { ok: true; viewer: OdooViewer } | { ok: false; error: string }

// Why: a host predating the project scope strips the unknown param and answers
// with an unscoped page. Presenting that as a project view would be wrong rather
// than merely stale, and post-filtering it locally would silently truncate the
// project to whatever fits the read's limit. The store rethrows this so the panel
// can say the remote needs updating instead of showing the wrong rows.
export class OdooProjectScopeUnsupportedError extends Error {
  constructor(message = 'This remote runtime must be updated to filter Odoo tickets by project.') {
    super(message)
    this.name = 'OdooProjectScopeUnsupportedError'
  }
}

export function isOdooProjectScopeUnsupportedError(
  error: unknown
): error is OdooProjectScopeUnsupportedError {
  return error instanceof OdooProjectScopeUnsupportedError
}

/** Refuses a project-scoped read the paired host cannot honour. Local targets
 *  ship main and renderer together, so they are never skewed. */
async function assertProjectScopeSupported(
  target: RuntimeClientTarget,
  projectScope: OdooProjectScope | null | undefined
): Promise<void> {
  if (target.kind !== 'environment' || !projectScope) {
    return
  }
  const supported = await runtimeEnvironmentSupportsCapability(
    target.environmentId,
    ODOO_PROJECT_SCOPE_RUNTIME_CAPABILITY,
    30_000
  )
  if (!supported) {
    throw new OdooProjectScopeUnsupportedError()
  }
}

export async function odooStatus(settings: RuntimeOdooSettings): Promise<OdooConnectionStatus> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooConnectionStatus>(target, 'odoo.status', undefined, { timeoutMs: 15_000 })
    : window.api.odoo.status()
}

export async function odooConnect(
  settings: RuntimeOdooSettings,
  args: { serverUrl: string; database: string; login: string; apiKey: string }
): Promise<OdooConnectResult> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooConnectResult>(target, 'odoo.connect', args, { timeoutMs: 30_000 })
    : window.api.odoo.connect(args)
}

export async function odooDisconnect(
  settings: RuntimeOdooSettings,
  instanceId?: string | null
): Promise<void> {
  const target = getOdooRuntimeTarget(settings)
  if (target.kind === 'environment') {
    await callRuntimeRpc<{ ok: true }>(
      target,
      'odoo.disconnect',
      instanceId ? { instanceId } : undefined,
      { timeoutMs: 15_000 }
    )
    return
  }
  await window.api.odoo.disconnect(instanceId ? { instanceId } : undefined)
}

export async function odooSelectInstance(
  settings: RuntimeOdooSettings,
  instanceId: OdooInstanceSelection
): Promise<OdooConnectionStatus> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooConnectionStatus>(
        target,
        'odoo.selectInstance',
        { instanceId },
        { timeoutMs: 15_000 }
      )
    : window.api.odoo.selectInstance({ instanceId })
}

export async function odooTestConnection(
  settings: RuntimeOdooSettings,
  instanceId?: string | null
): Promise<OdooConnectResult> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooConnectResult>(
        target,
        'odoo.testConnection',
        instanceId ? { instanceId } : undefined,
        { timeoutMs: 30_000 }
      )
    : window.api.odoo.testConnection(instanceId ? { instanceId } : undefined)
}

// No preset read here: a preset cannot express the domain the panel compiles, so
// falling back to one would answer a different question (see
// `odooTicketReadErrorMessage`). `odoo.listTickets` stays served for old clients.

export async function odooSearchTickets(
  settings: RuntimeOdooSettings,
  domain: unknown[],
  limit?: number,
  instanceId?: OdooInstanceSelection | null,
  projectScope?: OdooProjectScope | null
): Promise<OdooTicket[]> {
  const target = getOdooRuntimeTarget(settings)
  await assertProjectScopeSupported(target, projectScope)
  await assertCurrentUserTokenSupported(target, domain)
  const args = {
    domain,
    limit,
    instanceId: instanceId ?? undefined,
    ...(projectScope ? { projectScope } : {})
  }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooTicket[]>(target, 'odoo.searchTickets', args, { timeoutMs: 30_000 })
    : window.api.odoo.searchTickets(args)
}

export async function odooGetTicket(
  settings: RuntimeOdooSettings,
  id: number,
  instanceId?: string | null
): Promise<OdooTicket | null> {
  const target = getOdooRuntimeTarget(settings)
  const args = { id, instanceId: instanceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooTicket | null>(target, 'odoo.getTicket', args, { timeoutMs: 30_000 })
    : window.api.odoo.getTicket(args)
}

export async function odooCreateTicket(
  settings: RuntimeOdooSettings,
  args: OdooCreateTicketArgs
): Promise<OdooCreateTicketResult> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooCreateTicketResult>(target, 'odoo.createTicket', args, {
        timeoutMs: 30_000
      })
    : window.api.odoo.createTicket(args)
}

export async function odooUpdateTicket(
  settings: RuntimeOdooSettings,
  id: number,
  updates: OdooTicketUpdate,
  instanceId?: string | null
): Promise<OdooMutationResult> {
  const target = getOdooRuntimeTarget(settings)
  const args = { id, updates, instanceId: instanceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooMutationResult>(target, 'odoo.updateTicket', args, { timeoutMs: 30_000 })
    : window.api.odoo.updateTicket(args)
}

export async function odooAddTicketComment(
  settings: RuntimeOdooSettings,
  id: number,
  body: string,
  isNote?: boolean,
  instanceId?: string | null,
  mentionPartnerIds?: number[],
  attachmentIds?: number[]
): Promise<OdooMutationResult> {
  const target = getOdooRuntimeTarget(settings)
  const args = {
    id,
    body,
    isNote,
    instanceId: instanceId ?? undefined,
    mentionPartnerIds,
    attachmentIds
  }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooMutationResult>(target, 'odoo.addTicketComment', args, {
        timeoutMs: 30_000
      })
    : window.api.odoo.addTicketComment(args)
}

export async function odooTicketComments(
  settings: RuntimeOdooSettings,
  id: number,
  instanceId?: string | null
): Promise<OdooComment[]> {
  const target = getOdooRuntimeTarget(settings)
  const args = { id, instanceId: instanceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooComment[]>(target, 'odoo.ticketComments', args, { timeoutMs: 30_000 })
    : window.api.odoo.ticketComments(args)
}

export async function odooListProjects(
  settings: RuntimeOdooSettings,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooProject[]> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooProject[]>(
        target,
        'odoo.listProjects',
        instanceId ? { instanceId } : undefined,
        { timeoutMs: 30_000 }
      )
    : window.api.odoo.listProjects(instanceId ? { instanceId } : undefined)
}

export async function odooListStages(
  settings: RuntimeOdooSettings,
  projectId: number,
  instanceId?: string | null
): Promise<OdooStage[]> {
  const target = getOdooRuntimeTarget(settings)
  const args = { projectId, instanceId: instanceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooStage[]>(target, 'odoo.listStages', args, { timeoutMs: 30_000 })
    : window.api.odoo.listStages(args)
}

export async function odooListTags(
  settings: RuntimeOdooSettings,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooTag[]> {
  const target = getOdooRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooTag[]>(target, 'odoo.listTags', instanceId ? { instanceId } : undefined, {
        timeoutMs: 30_000
      })
    : window.api.odoo.listTags(instanceId ? { instanceId } : undefined)
}

/** Every distinct stage name of the instance, for the board mapping picker. */
export async function odooListStageNames(
  settings: RuntimeOdooSettings,
  instanceId?: OdooInstanceSelection | null
): Promise<string[]> {
  const target = getOdooRuntimeTarget(settings)
  const args = instanceId ? { instanceId } : undefined
  return target.kind === 'environment'
    ? callRuntimeRpc<string[]>(target, 'odoo.listStageNames', args, { timeoutMs: 30_000 })
    : window.api.odoo.listStageNames(args)
}

export async function odooListAssignableUsers(
  settings: RuntimeOdooSettings,
  query?: string,
  instanceId?: string | null
): Promise<OdooUser[]> {
  if (!isRuntimeProviderSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getOdooRuntimeTarget(settings)
  const args = { query, instanceId: instanceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooUser[]>(target, 'odoo.listAssignableUsers', args, { timeoutMs: 30_000 })
    : window.api.odoo.listAssignableUsers(args)
}
