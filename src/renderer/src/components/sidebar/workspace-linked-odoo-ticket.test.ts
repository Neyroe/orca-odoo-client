import { describe, expect, it } from 'vitest'

import { getWorkspaceLinkedOdooTicket } from './workspace-linked-odoo-ticket'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { Worktree } from '../../../../shared/worktree/types'

function worktree(overrides: Partial<Worktree>): Worktree {
  return { ...(overrides as Worktree) }
}

const odooSourceContext = {
  provider: 'odoo',
  projectId: 'account-backed-task-source',
  hostId: 'local',
  providerIdentity: {
    provider: 'odoo',
    instanceId: 'prod',
    serverUrl: 'https://odoo.example',
    database: 'prod',
    projectId: 12
  }
} as unknown as TaskSourceContext

describe('getWorkspaceLinkedOdooTicket', () => {
  it('returns nothing for a workspace with no Odoo link', () => {
    expect(getWorkspaceLinkedOdooTicket(worktree({}))).toBeNull()
    expect(
      getWorkspaceLinkedOdooTicket(
        worktree({
          linkedWorkItem: {
            provider: 'jira',
            type: 'issue',
            number: 12,
            title: 'Elsewhere',
            url: 'https://jira.example/ORC-12'
          }
        })
      )
    ).toBeNull()
  })

  it('reads the ticket, its instance, and its source identity off a worktree', () => {
    expect(
      getWorkspaceLinkedOdooTicket(
        worktree({
          linkedOdooTicket: 45514,
          linkedOdooInstanceId: 'prod',
          linkedTaskSourceContext: odooSourceContext,
          linkedWorkItem: {
            provider: 'odoo',
            type: 'issue',
            number: 45514,
            title: 'Connecteur EDI',
            url: 'https://odoo.example/odoo/project/1/tasks/45514',
            odooInstanceId: 'prod'
          }
        })
      )
    ).toEqual({
      id: 45514,
      instanceId: 'prod',
      ref: '#45514',
      title: 'Connecteur EDI',
      url: 'https://odoo.example/odoo/project/1/tasks/45514',
      sourceContext: odooSourceContext
    })
  })

  it('resolves a folder workspace, which carries the link only as a work item', () => {
    expect(
      getWorkspaceLinkedOdooTicket(
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
    ).toEqual({
      id: 4,
      instanceId: 'staging',
      ref: '#4',
      title: 'Private todo',
      url: 'https://odoo.example/odoo/project/tasks/4',
      sourceContext: null
    })
  })

  it('keeps a link whose stored title describes another ticket unlabelled', () => {
    expect(
      getWorkspaceLinkedOdooTicket(
        worktree({
          linkedOdooTicket: 45514,
          linkedWorkItem: {
            provider: 'odoo',
            type: 'issue',
            number: 999,
            title: 'Displaced link',
            url: 'https://odoo.example/odoo/project/1/tasks/999'
          }
        })
      )
    ).toEqual({
      id: 45514,
      instanceId: null,
      ref: '#45514',
      title: null,
      url: null,
      sourceContext: null
    })
  })

  it('ignores a source context that belongs to another provider', () => {
    const link = getWorkspaceLinkedOdooTicket(
      worktree({
        linkedOdooTicket: 7,
        linkedTaskSourceContext: { provider: 'jira' } as unknown as TaskSourceContext
      })
    )
    expect(link?.sourceContext).toBeNull()
  })
})
