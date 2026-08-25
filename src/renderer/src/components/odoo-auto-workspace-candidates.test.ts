import { describe, expect, it } from 'vitest'

import {
  capOdooAutoWorkspaceRun,
  isOdooTicketClosed,
  selectOdooAutoWorkspaceCandidates
} from './odoo-auto-workspace-candidates'
import { ODOO_CLOSED_STATES } from '../../../shared/odoo-types'
import type { OdooTicket, OdooTicketState } from '../../../shared/odoo-types'

function ticket(id: number, state: OdooTicketState = '01_in_progress'): OdooTicket {
  return { id, ref: `#${id}`, title: `Ticket ${id}`, url: '', state } as OdooTicket
}

describe('isOdooTicketClosed', () => {
  it('covers every closed state the shared list declares', () => {
    for (const state of ODOO_CLOSED_STATES) {
      expect(isOdooTicketClosed({ state })).toBe(true)
    }
    expect(isOdooTicketClosed({ state: '01_in_progress' })).toBe(false)
  })
})

describe('selectOdooAutoWorkspaceCandidates', () => {
  it('never returns a closed ticket, whatever the filter matched', () => {
    const selected = selectOdooAutoWorkspaceCandidates(
      [ticket(1, '1_done'), ticket(2, '1_canceled'), ticket(3)],
      { excludedTicketIds: new Set<number>() }
    )

    expect(selected.map((entry) => entry.id)).toEqual([3])
  })

  it('skips tickets already handled or linked to a workspace', () => {
    const selected = selectOdooAutoWorkspaceCandidates([ticket(1), ticket(2)], {
      excludedTicketIds: new Set([1])
    })

    expect(selected.map((entry) => entry.id)).toEqual([2])
  })
})

describe('capOdooAutoWorkspaceRun', () => {
  it('reports what the cap dropped rather than dropping it silently', () => {
    expect(capOdooAutoWorkspaceRun([1, 2, 3, 4], 2)).toEqual({
      selected: [1, 2],
      droppedByCap: 2
    })
  })

  it('selects nothing when the cap is zero', () => {
    expect(capOdooAutoWorkspaceRun([1, 2], 0)).toEqual({ selected: [], droppedByCap: 0 })
  })
})
