import { markdownToChatterHtml } from './chatter-html-markdown'
import { acquire, executeKw, getClients, release, type OdooClientForInstance } from './client'
import {
  loadLookups,
  mapStage,
  mapTag,
  mapTicket,
  mapUser,
  readString,
  ticketRef,
  ticketUrl,
  TICKET_FIELDS,
  type OdooRecord
} from './ticket-mappers'
import { ODOO_CLOSED_STATES } from '../../shared/odoo-types'
import type {
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
  OdooUser
} from '../../shared/types'

type OdooDomain = unknown[]

// Why: mirrors the domain on Odoo's own My/All Tasks actions, which hide
// template tasks. Without it Orca would list tickets the Odoo UI never shows.
const BASE_DOMAIN: OdooDomain = [
  ['has_template_ancestor', '=', false],
  ['has_project_template', '=', false]
]

const OPEN_STATE_DOMAIN: OdooDomain = [['state', 'not in', [...ODOO_CLOSED_STATES]]]

function filterDomain(filter: OdooTicketFilter, uid: number): OdooDomain {
  if (filter === 'done') {
    return [...BASE_DOMAIN, ['state', 'in', [...ODOO_CLOSED_STATES]]]
  }
  if (filter === 'assigned') {
    return [...BASE_DOMAIN, ...OPEN_STATE_DOMAIN, ['user_ids', 'in', [uid]]]
  }
  if (filter === 'reported') {
    return [...BASE_DOMAIN, ...OPEN_STATE_DOMAIN, ['create_uid', '=', uid]]
  }
  return [...BASE_DOMAIN, ...OPEN_STATE_DOMAIN]
}

async function readTickets(
  client: OdooClientForInstance,
  domain: OdooDomain,
  limit?: number
): Promise<OdooTicket[]> {
  const rows = await executeKw<OdooRecord[]>(client, 'project.task', 'search_read', [domain], {
    fields: TICKET_FIELDS,
    limit: limit ?? 50,
    order: 'priority desc, write_date desc'
  })
  const lookups = await loadLookups(client, rows)
  return rows.map((row) => mapTicket(client, row, lookups))
}

async function forEachClient<T>(
  selection: OdooInstanceSelection | null | undefined,
  run: (client: OdooClientForInstance) => Promise<T[]>
): Promise<T[]> {
  const clients = getClients(selection)
  await acquire()
  try {
    const results = await Promise.all(clients.map((client) => run(client)))
    return results.flat()
  } finally {
    release()
  }
}

export async function listTickets(
  filter: OdooTicketFilter = 'assigned',
  limit?: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooTicket[]> {
  return forEachClient(instanceId, (client) =>
    readTickets(client, filterDomain(filter, client.instance.uid), limit)
  )
}

/** Runs a raw Odoo domain, the closest analogue to Jira's JQL search. */
export async function searchTickets(
  domain: OdooDomain,
  limit?: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooTicket[]> {
  return forEachClient(instanceId, (client) =>
    readTickets(client, [...BASE_DOMAIN, ...domain], limit)
  )
}

export async function getTicket(
  id: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooTicket | null> {
  const tickets = await forEachClient(instanceId, (client) =>
    readTickets(client, [['id', '=', id]], 1)
  )
  return tickets[0] ?? null
}

export async function createTicket(args: OdooCreateTicketArgs): Promise<OdooCreateTicketResult> {
  const client = getClients(args.instanceId)[0]
  if (!client) {
    return { ok: false, error: 'Not connected to Odoo.' }
  }
  await acquire()
  try {
    const values: OdooRecord = {
      name: args.title,
      project_id: args.projectId
    }
    if (args.description) {
      // `description` is an Odoo Html field; mapTicket reads it back as
      // markdown, so writes convert the other way to keep round trips lossless.
      values.description = markdownToChatterHtml(args.description)
    }
    if (args.priority) {
      values.priority = args.priority
    }
    if (args.stageId) {
      values.stage_id = args.stageId
    }
    if (args.assigneeIds && args.assigneeIds.length > 0) {
      // Odoo x2many write command 6 = replace the whole set.
      values.user_ids = [[6, 0, args.assigneeIds]]
    }
    const id = await executeKw<number>(client, 'project.task', 'create', [values])
    return {
      ok: true,
      id,
      ref: ticketRef(id),
      url: ticketUrl(client.instance.serverUrl, id)
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not create ticket.' }
  } finally {
    release()
  }
}

function buildUpdateValues(updates: OdooTicketUpdate): OdooRecord {
  const values: OdooRecord = {}
  if (updates.title !== undefined) {
    values.name = updates.title
  }
  if (updates.description !== undefined) {
    values.description = markdownToChatterHtml(updates.description)
  }
  if (updates.stageId !== undefined) {
    values.stage_id = updates.stageId
  }
  if (updates.priority !== undefined) {
    values.priority = updates.priority
  }
  if (updates.state !== undefined) {
    values.state = updates.state
  }
  if (updates.assigneeIds !== undefined) {
    values.user_ids = [[6, 0, updates.assigneeIds]]
  }
  if (updates.tagIds !== undefined) {
    values.tag_ids = [[6, 0, updates.tagIds]]
  }
  if (updates.deadline !== undefined) {
    // Odoo clears a date field with `false`, not null/empty string.
    values.date_deadline = updates.deadline ?? false
  }
  return values
}

export async function updateTicket(
  id: number,
  updates: OdooTicketUpdate,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooMutationResult> {
  const client = getClients(instanceId)[0]
  if (!client) {
    return { ok: false, error: 'Not connected to Odoo.' }
  }
  const values = buildUpdateValues(updates)
  if (Object.keys(values).length === 0) {
    return { ok: true }
  }

  await acquire()
  try {
    await executeKw<boolean>(client, 'project.task', 'write', [[id], values])
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not update ticket.' }
  } finally {
    release()
  }
}

export async function listProjects(
  instanceId?: OdooInstanceSelection | null
): Promise<OdooProject[]> {
  return forEachClient(instanceId, async (client) => {
    const rows = await executeKw<OdooRecord[]>(client, 'project.project', 'search_read', [[]], {
      fields: ['id', 'name'],
      order: 'name asc'
    })
    return rows.map((row) => ({
      id: row.id as number,
      name: readString(row.name) ?? String(row.id),
      instanceId: client.instance.id,
      instanceName: client.instance.displayName
    }))
  })
}

/** Stages replace Jira transitions: moving a ticket writes `stage_id` directly. */
export async function listStages(
  projectId: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooStage[]> {
  const client = getClients(instanceId)[0]
  if (!client) {
    return []
  }
  await acquire()
  try {
    const rows = await executeKw<OdooRecord[]>(
      client,
      'project.task.type',
      'search_read',
      [[['project_ids', 'in', [projectId]]]],
      { fields: ['id', 'name', 'sequence', 'fold'], order: 'sequence asc' }
    )
    return rows.map(mapStage)
  } finally {
    release()
  }
}

export async function listTags(instanceId?: OdooInstanceSelection | null): Promise<OdooTag[]> {
  return forEachClient(instanceId, async (client) => {
    const rows = await executeKw<OdooRecord[]>(client, 'project.tags', 'search_read', [[]], {
      fields: ['id', 'name', 'color'],
      order: 'name asc'
    })
    return rows.map(mapTag)
  })
}

export async function listAssignableUsers(
  query?: string,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooUser[]> {
  const client = getClients(instanceId)[0]
  if (!client) {
    return []
  }
  await acquire()
  try {
    // `share = false` keeps portal/public users out of the assignee picker.
    const domain: OdooDomain = [['share', '=', false]]
    if (query) {
      domain.push(['name', 'ilike', query])
    }
    const rows = await executeKw<OdooRecord[]>(client, 'res.users', 'search_read', [domain], {
      fields: ['id', 'name', 'login'],
      limit: 50,
      order: 'name asc'
    })
    return rows.map(mapUser)
  } finally {
    release()
  }
}
