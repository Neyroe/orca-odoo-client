import type {
  GlobalSettings,
  OdooComment,
  OdooConnectionStatus,
  OdooCreateTicketArgs,
  OdooCreateTicketResult,
  OdooInstanceSelection,
  OdooMutationResult,
  OdooProject,
  OdooStage,
  OdooTag,
  OdooTicket,
  OdooTicketFilter,
  OdooTicketUpdate,
  OdooUser,
  OdooViewer
} from '../../../shared/types'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'
import { isRuntimeProviderSearchQueryWithinLimit } from './runtime-provider-search-bounds'

export type RuntimeOdooSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | TaskSourceContext
  | null
  | undefined

export type OdooConnectResult = { ok: true; viewer: OdooViewer } | { ok: false; error: string }

function isTaskSourceRuntimeSettings(settings: RuntimeOdooSettings): settings is TaskSourceContext {
  return settings !== null && settings !== undefined && 'kind' in settings
}

function getOdooRuntimeTarget(
  settings: RuntimeOdooSettings
): ReturnType<typeof getActiveRuntimeTarget> {
  // Why: task source context makes provider ownership explicit; legacy callers
  // still pass focused runtime settings until Tasks finishes migrating.
  return getActiveRuntimeTarget(
    isTaskSourceRuntimeSettings(settings) ? getTaskSourceRuntimeSettings(settings) : settings
  )
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

export async function odooListTickets(
  settings: RuntimeOdooSettings,
  filter?: OdooTicketFilter,
  limit?: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooTicket[]> {
  const target = getOdooRuntimeTarget(settings)
  const args = { filter, limit, instanceId: instanceId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<OdooTicket[]>(target, 'odoo.listTickets', args, { timeoutMs: 30_000 })
    : window.api.odoo.listTickets(args)
}

export async function odooSearchTickets(
  settings: RuntimeOdooSettings,
  domain: unknown[],
  limit?: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooTicket[]> {
  const target = getOdooRuntimeTarget(settings)
  const args = { domain, limit, instanceId: instanceId ?? undefined }
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
  instanceId?: string | null
): Promise<OdooMutationResult> {
  const target = getOdooRuntimeTarget(settings)
  const args = { id, body, instanceId: instanceId ?? undefined }
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
