import { describe, expect, it } from 'vitest'
import { areWorkspaceLinkedItemsEqual, normalizeWorkspaceLinkedItem } from './workspace-linked-item'

const odooTicket = {
  provider: 'odoo',
  type: 'issue',
  number: 45441,
  title: '[CAM] Task 3651 : D2',
  url: 'https://odoo.example.com/odoo/project.task/45441',
  odooInstanceId: 'instance-1'
}

describe('normalizeWorkspaceLinkedItem', () => {
  it('keeps Odoo tickets and their instance id', () => {
    expect(normalizeWorkspaceLinkedItem(odooTicket)).toEqual(odooTicket)
  })

  it('accepts every task provider', () => {
    for (const provider of ['github', 'gitlab', 'linear', 'jira', 'odoo'] as const) {
      expect(normalizeWorkspaceLinkedItem({ ...odooTicket, provider })?.provider).toBe(provider)
    }
  })

  it('rejects unknown providers', () => {
    expect(normalizeWorkspaceLinkedItem({ ...odooTicket, provider: 'trello' })).toBeNull()
  })
})

describe('areWorkspaceLinkedItemsEqual', () => {
  it('separates identical ticket ids coming from different Odoo instances', () => {
    const a = normalizeWorkspaceLinkedItem(odooTicket)
    const b = normalizeWorkspaceLinkedItem({ ...odooTicket, odooInstanceId: 'instance-2' })
    expect(areWorkspaceLinkedItemsEqual(a, b)).toBe(false)
    expect(areWorkspaceLinkedItemsEqual(a, normalizeWorkspaceLinkedItem(odooTicket))).toBe(true)
  })
})
