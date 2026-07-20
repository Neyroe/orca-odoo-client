/**
 * TEMPORARY live verification spec — drives the Odoo task provider against
 * the local Odoo 19 dev server. Not part of the committed suite: it embeds
 * real credentials and requires the live server on localhost:8069.
 */
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady, waitForActiveWorktree } from './helpers/store'

// Isolated HOME so the odoo credential files never touch the real ~/.orca.
const isolatedHome = mkdtempSync(path.join(os.tmpdir(), 'orca-odoo-home-'))
test.use({ orcaAppExtraEnv: { HOME: isolatedHome } })

const ODOO = {
  serverUrl: 'http://localhost:8069',
  database: 'odoo_orca_poc',
  login: 'admin',
  apiKey: '588e10fb9c93d19981e2a1215f72fc4d030bf8cd'
}

test.describe('Odoo task provider (live)', () => {
  test('connects, lists, filters, edits, and comments', async ({ orcaPage }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)

    await orcaPage.evaluate(() => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      store.getState().openTaskPage({ taskSource: 'odoo' })
    })

    // Connect gate renders for a fresh profile.
    await expect(orcaPage.getByText('Connect your Odoo server')).toBeVisible({ timeout: 20_000 })
    await orcaPage.getByRole('button', { name: 'Connect Odoo' }).click()

    // PROBE: a bad API key must surface Odoo's rejection, not connect.
    await orcaPage.getByLabel('Odoo server URL').fill(ODOO.serverUrl)
    await orcaPage.getByLabel('Database').fill(ODOO.database)
    await orcaPage.getByLabel('Login').fill(ODOO.login)
    await orcaPage.getByLabel('API key').fill('definitely-not-a-key')
    await orcaPage.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(orcaPage.getByText(/rejected the credentials/i)).toBeVisible({ timeout: 20_000 })
    await testInfo.attach('bad-key-error', {
      body: await orcaPage.screenshot(),
      contentType: 'image/png'
    })

    // Real key connects and lands on the ticket list.
    await orcaPage.getByLabel('API key').fill(ODOO.apiKey)
    await orcaPage.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(orcaPage.getByText('Odoo tickets')).toBeVisible({ timeout: 20_000 })

    // Default preset is Assigned: admin is assigned to ticket #4.
    await expect(orcaPage.getByText('Ajouter le connecteur Odoo')).toBeVisible({
      timeout: 20_000
    })

    // All Open shows the unassigned backlog ticket too.
    await orcaPage.getByRole('button', { name: 'All Open' }).click()
    await expect(orcaPage.getByText('Corriger le parsing des dates')).toBeVisible({
      timeout: 20_000
    })
    await testInfo.attach('ticket-list-all-open', {
      body: await orcaPage.screenshot(),
      contentType: 'image/png'
    })

    // PROBE: title search narrows to the matching ticket.
    await orcaPage.getByPlaceholder('Search tickets by title…').fill('connecteur')
    await orcaPage.getByPlaceholder('Search tickets by title…').press('Enter')
    await expect(orcaPage.getByText('Ajouter le connecteur Odoo')).toBeVisible({
      timeout: 20_000
    })
    await expect(orcaPage.getByText('Corriger le parsing des dates')).not.toBeVisible()

    // Open the detail sheet.
    await orcaPage.getByText('Ajouter le connecteur Odoo').click()
    const sheet = orcaPage.getByRole('dialog')
    await expect(sheet.getByRole('button', { name: 'Open in Odoo' })).toBeVisible({
      timeout: 15_000
    })
    // Scoped to the sheet: the list row behind it shows the same stage badge.
    await expect(sheet.getByText('En cours')).toBeVisible()

    // Change priority Medium -> High against the live server.
    await orcaPage.getByRole('combobox').filter({ hasText: 'Medium' }).click()
    await orcaPage.getByRole('option', { name: 'High' }).click()
    await expect(orcaPage.getByText('Ticket updated.')).toBeVisible({ timeout: 20_000 })

    // Post a chatter comment.
    await orcaPage.getByPlaceholder('Add a comment…').fill('Vérification E2E **depuis Orca**')
    await orcaPage.getByRole('button', { name: 'Comment', exact: true }).click()
    await expect(orcaPage.getByText('Comment posted.')).toBeVisible({ timeout: 20_000 })
    await expect(orcaPage.getByText(/Vérification E2E/)).toBeVisible({ timeout: 20_000 })
    await testInfo.attach('ticket-detail-after-edits', {
      body: await orcaPage.screenshot(),
      contentType: 'image/png'
    })

    // Restore priority so the dataset stays as it was.
    await orcaPage.getByRole('combobox').filter({ hasText: 'High' }).click()
    await orcaPage.getByRole('option', { name: 'Medium' }).click()
    await expect(orcaPage.getByText('Ticket updated.').first()).toBeVisible({ timeout: 20_000 })
  })
})
