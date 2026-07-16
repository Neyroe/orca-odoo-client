import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredString
} from '../schemas'

const VALID_FILTERS = ['assigned', 'reported', 'all', 'done'] as const
const VALID_PRIORITIES = ['0', '1', '2', '3'] as const
const VALID_STATES = [
  '01_in_progress',
  '02_changes_requested',
  '03_approved',
  '04_waiting_normal',
  '1_done',
  '1_canceled'
] as const

const InstanceSelection = z
  .object({
    instanceId: OptionalString
  })
  .optional()

const Connect = z.object({
  serverUrl: requiredString('Server URL is required'),
  database: requiredString('Database is required'),
  login: requiredString('Login is required'),
  apiKey: requiredString('API key is required')
})

const SelectInstance = z.object({
  instanceId: requiredString('Instance ID is required')
})

const TicketId = z.object({
  id: z.number().int().positive(),
  instanceId: OptionalString
})

const ListTickets = z
  .object({
    filter: z.enum(VALID_FILTERS).optional(),
    limit: OptionalFiniteNumber,
    instanceId: OptionalString
  })
  .optional()

const SearchTickets = z.object({
  // An Odoo domain is a heterogeneous array of leaves and operators; its shape
  // is validated server-side by Odoo itself.
  domain: z.array(z.unknown()),
  limit: OptionalFiniteNumber,
  instanceId: OptionalString
})

const CreateTicket = z.object({
  instanceId: OptionalString,
  projectId: z.number().int().positive(),
  title: requiredString('Title is required'),
  description: OptionalPlainString,
  priority: z.enum(VALID_PRIORITIES).optional(),
  stageId: z.number().int().positive().optional(),
  assigneeIds: z.array(z.number().int().positive()).optional()
})

const UpdateTicket = z.object({
  id: z.number().int().positive(),
  instanceId: OptionalString,
  updates: z.object({
    title: OptionalString,
    description: OptionalString,
    stageId: z.number().int().positive().optional(),
    priority: z.enum(VALID_PRIORITIES).optional(),
    state: z.enum(VALID_STATES).optional(),
    assigneeIds: z.array(z.number().int().positive()).optional(),
    tagIds: z.array(z.number().int().positive()).optional(),
    deadline: z.union([z.string(), z.null()]).optional()
  })
})

const TicketComment = z.object({
  id: z.number().int().positive(),
  body: requiredString('Comment body is required'),
  instanceId: OptionalString
})

const ProjectStages = z.object({
  projectId: z.number().int().positive(),
  instanceId: OptionalString
})

const AssignableUsers = z.object({
  query: OptionalPlainString,
  instanceId: OptionalString
})

export const ODOO_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'odoo.connect',
    params: Connect,
    handler: async (params, { runtime }) =>
      runtime.odooConnect({
        serverUrl: params.serverUrl.trim(),
        database: params.database.trim(),
        login: params.login.trim(),
        apiKey: params.apiKey.trim()
      })
  }),
  defineMethod({
    name: 'odoo.disconnect',
    params: InstanceSelection,
    handler: async (params, { runtime }) => runtime.odooDisconnect(params?.instanceId)
  }),
  defineMethod({
    name: 'odoo.selectInstance',
    params: SelectInstance,
    handler: async (params, { runtime }) => runtime.odooSelectInstance(params.instanceId.trim())
  }),
  defineMethod({
    name: 'odoo.status',
    params: null,
    handler: async (_params, { runtime }) => runtime.odooStatus()
  }),
  defineMethod({
    name: 'odoo.testConnection',
    params: InstanceSelection,
    handler: async (params, { runtime }) => runtime.odooTestConnection(params?.instanceId)
  }),
  defineMethod({
    name: 'odoo.listTickets',
    params: ListTickets,
    handler: async (params, { runtime }) =>
      runtime.odooListTickets(params?.filter, params?.limit, params?.instanceId)
  }),
  defineMethod({
    name: 'odoo.searchTickets',
    params: SearchTickets,
    handler: async (params, { runtime }) =>
      runtime.odooSearchTickets(params.domain, params.limit, params.instanceId)
  }),
  defineMethod({
    name: 'odoo.getTicket',
    params: TicketId,
    handler: async (params, { runtime }) => runtime.odooGetTicket(params.id, params.instanceId)
  }),
  defineMethod({
    name: 'odoo.createTicket',
    params: CreateTicket,
    handler: async (params, { runtime }) =>
      runtime.odooCreateTicket({
        instanceId: params.instanceId,
        projectId: params.projectId,
        title: params.title.trim(),
        description: params.description?.trim() || undefined,
        priority: params.priority,
        stageId: params.stageId,
        assigneeIds: params.assigneeIds
      })
  }),
  defineMethod({
    name: 'odoo.updateTicket',
    params: UpdateTicket,
    handler: async (params, { runtime }) =>
      runtime.odooUpdateTicket(params.id, params.updates, params.instanceId)
  }),
  defineMethod({
    name: 'odoo.addTicketComment',
    params: TicketComment,
    handler: async (params, { runtime }) =>
      runtime.odooAddTicketComment(params.id, params.body.trim(), params.instanceId)
  }),
  defineMethod({
    name: 'odoo.ticketComments',
    params: TicketId,
    handler: async (params, { runtime }) => runtime.odooTicketComments(params.id, params.instanceId)
  }),
  defineMethod({
    name: 'odoo.listProjects',
    params: InstanceSelection,
    handler: async (params, { runtime }) => runtime.odooListProjects(params?.instanceId)
  }),
  defineMethod({
    name: 'odoo.listStages',
    params: ProjectStages,
    handler: async (params, { runtime }) =>
      runtime.odooListStages(params.projectId, params.instanceId)
  }),
  defineMethod({
    name: 'odoo.listTags',
    params: InstanceSelection,
    handler: async (params, { runtime }) => runtime.odooListTags(params?.instanceId)
  }),
  defineMethod({
    name: 'odoo.listAssignableUsers',
    params: AssignableUsers,
    handler: async (params, { runtime }) =>
      runtime.odooListAssignableUsers(params.query, params.instanceId)
  })
]
