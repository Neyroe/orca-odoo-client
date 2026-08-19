import { describe, expect, it } from 'vitest'

import {
  normalizeOdooFilterSearch,
  odooFilterOptionMatches
} from './odoo-ticket-filter-option-search'

describe('odooFilterOptionMatches', () => {
  it('matches a substring of the option text', () => {
    expect(odooFilterOptionMatches('1650 - Golf Club de Toulouse', 'golf')).toBe(true)
    expect(odooFilterOptionMatches('Ressources Humaines', 'ressources')).toBe(true)
  })

  it('ignores case and accents in both directions', () => {
    expect(odooFilterOptionMatches('Développements', 'developpements')).toBe(true)
    expect(odooFilterOptionMatches('Developpements', 'DÉVELOPPEMENTS')).toBe(true)
  })

  it('rejects a subsequence that is not a substring', () => {
    // What cmdk's fuzzy default accepted, and why the project box stopped narrowing.
    expect(odooFilterOptionMatches('Développements Anaël Dufrechou', 'dev')).toBe(true)
    expect(odooFilterOptionMatches('1650 - Golf Club de Toulouse', 'dev')).toBe(false)
    expect(odooFilterOptionMatches('Formations Qualiopi', 'qqq')).toBe(false)
    expect(odooFilterOptionMatches('1430 - Projet modele', 'zz')).toBe(false)
  })

  it('matches everything while the box is empty', () => {
    expect(odooFilterOptionMatches('Développements', '')).toBe(true)
    expect(odooFilterOptionMatches('Développements', '   ')).toBe(true)
  })

  it('matches the instance name a project search text carries', () => {
    expect(odooFilterOptionMatches('Développements Anaël Dufrechou', 'dufrechou')).toBe(true)
  })
})

describe('normalizeOdooFilterSearch', () => {
  it('trims, lowercases and strips diacritics', () => {
    expect(normalizeOdooFilterSearch('  Coûts Récurrents  ')).toBe('couts recurrents')
  })
})
