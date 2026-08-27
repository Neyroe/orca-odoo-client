// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OdooRawDomainDialog } from './odoo-raw-domain-dialog'
import { rememberOdooRawDomainSourceText } from './odoo-raw-domain-source-text'
import { DEFAULT_ODOO_TICKET_FILTERS } from './odoo-ticket-facets'
import type { OdooDomain } from '../../../shared/odoo-types'

const RAF_DOMAIN: OdooDomain = [['s_raf', '>', 0]]

type DialogProps = React.ComponentProps<typeof OdooRawDomainDialog>

function props(overrides: Partial<DialogProps>): DialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    filters: DEFAULT_ODOO_TICKET_FILTERS,
    viewerUid: 180,
    rawDomain: null,
    onApply: vi.fn(),
    ...overrides
  }
}

function editor(): HTMLTextAreaElement {
  return screen.getByLabelText('Odoo domain') as HTMLTextAreaElement
}

/** The preview block by id: `getByText` collapses the newlines it exists to show. */
function preview(): HTMLElement {
  const node = document.getElementById('odoo-raw-domain-dialog-preview')
  if (!node) {
    throw new Error('the dialog rendered no preview')
  }
  return node
}

function applyButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
}

/** user-event reads `[` and `{` as key descriptors; doubling types the literal. */
function keystrokes(text: string): string {
  return text.replace(/[[{]/g, (char) => char + char)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

describe('OdooRawDomainDialog', () => {
  it('opens on the stored domain pretty-printed, for a filter that has no text', () => {
    // A filter saved before the text was remembered, a preset chip, another
    // machine: the notation is the same one the editor writes back.
    render(
      <OdooRawDomainDialog
        {...props({
          rawDomain: [
            ['stage_id', '=', 103],
            ['s_raf', '>', 0]
          ]
        })}
      />
    )

    expect(editor()).toHaveValue("[\n  ('stage_id', '=', 103),\n  ('s_raf', '>', 0)\n]")
  })

  it('opens on the formatting the user wrote, once it has been applied', () => {
    const typed = "[\n\n    ('s_raf', '>', 0),\n]"
    rememberOdooRawDomainSourceText(RAF_DOMAIN, typed)

    render(<OdooRawDomainDialog {...props({ rawDomain: RAF_DOMAIN })} />)

    expect(editor()).toHaveValue(typed)
  })

  it('shows the aggregate: the raw domain and the facets already selected', async () => {
    render(
      <OdooRawDomainDialog
        {...props({ filters: { ...DEFAULT_ODOO_TICKET_FILTERS, stages: ['Review'] } })}
      />
    )

    await userEvent.type(editor(), keystrokes("[('s_raf', '>', 0)]"))

    expect(preview().textContent).toBe(
      "[\n  ('stage_id.name', 'in', ['Review']),\n  ('s_raf', '>', 0)\n]"
    )
  })

  it('follows the draft as it is typed without applying any of it', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainDialog {...props({ onApply })} />)

    await userEvent.type(editor(), keystrokes("[('s_raf', '>', 0)]"))

    expect(preview().textContent).toBe("[\n  ('s_raf', '>', 0)\n]")
    // The read cache keys on the domain over 500 entries; a read per character
    // would spend the whole cache on half-typed domains.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('names the token the read will resolve, and only when it is there', async () => {
    const { rerender } = render(<OdooRawDomainDialog {...props({})} />)

    expect(screen.queryByText(/\$orca:me stands for the signed-in user/)).not.toBeInTheDocument()

    rerender(
      <OdooRawDomainDialog
        {...props({ filters: { ...DEFAULT_ODOO_TICKET_FILTERS, assignees: ['180'] } })}
      />
    )

    expect(screen.getByText(/\$orca:me stands for the signed-in user/)).toBeInTheDocument()
    expect(preview().textContent).toBe("[\n  ('user_ids', 'in', ['$orca:me'])\n]")
  })

  it('gives the domain block its own scroll container, so a wide one stays inside it', async () => {
    render(<OdooRawDomainDialog {...props({})} />)

    await userEvent.type(
      editor(),
      keystrokes("[('user_ids', 'in', [180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190])]")
    )

    // happy-dom lays nothing out, so this pins the contract rather than the pixels:
    // the block scrolls, and the section around it cannot be widened by it.
    expect(preview().className).toContain('overflow-auto')
    expect(preview().parentElement?.className).toContain('min-w-0')
  })

  it('says what the preview leaves out, so it does not read as exhaustive', () => {
    render(<OdooRawDomainDialog {...props({})} />)

    expect(
      screen.getByText(/template-task exclusion and the selected projects are added on top/)
    ).toBeInTheDocument()
  })

  it('applies on its button, remembers the formatting, and closes', async () => {
    const onApply = vi.fn()
    const onOpenChange = vi.fn()
    render(<OdooRawDomainDialog {...props({ onApply, onOpenChange })} />)

    await userEvent.type(editor(), keystrokes("[\n  ('s_raf', '>', 0),\n]"))
    await userEvent.click(applyButton())

    expect(onApply).toHaveBeenCalledWith(RAF_DOMAIN)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    cleanup()
    render(<OdooRawDomainDialog {...props({ rawDomain: RAF_DOMAIN })} />)
    expect(editor()).toHaveValue("[\n  ('s_raf', '>', 0),\n]")
  })

  it('keeps Enter a newline, since the editor exists for multi-line domains', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainDialog {...props({ onApply })} />)

    await userEvent.type(editor(), `${keystrokes("[('s_raf', '>', 0)]")}{Enter}`)

    expect(editor().value).toBe("[('s_raf', '>', 0)]\n")
    expect(onApply).not.toHaveBeenCalled()
  })

  it('says why there is no domain rather than showing an empty one', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainDialog {...props({ onApply })} />)

    await userEvent.type(editor(), keystrokes("[('s_raf', '>', 0)"))

    expect(screen.getByText('The "[" opened at character 1 is never closed.')).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()
    expect(onApply).not.toHaveBeenCalled()
  })

  it("refuses a domain the compiler refuses, in the compiler's words", async () => {
    render(<OdooRawDomainDialog {...props({})} />)

    await userEvent.type(editor(), keystrokes("['&', ('s_raf', '>', 0)]"))

    expect(
      screen.getByText('The "&" operator at position 0 is missing an operand.')
    ).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()
  })

  it('closes without restarting a read when the domain has not changed', async () => {
    const onApply = vi.fn()
    const onOpenChange = vi.fn()
    render(<OdooRawDomainDialog {...props({ rawDomain: RAF_DOMAIN, onApply, onOpenChange })} />)

    await userEvent.click(applyButton())

    expect(onApply).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clears the raw domain when the editor is emptied', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainDialog {...props({ rawDomain: RAF_DOMAIN, onApply })} />)

    await userEvent.clear(editor())
    await userEvent.click(applyButton())

    expect(onApply).toHaveBeenCalledWith(null)
  })

  it('reopens on the draft it was applied with, not on the one it was left with', async () => {
    const { rerender } = render(<OdooRawDomainDialog {...props({ rawDomain: RAF_DOMAIN })} />)

    await userEvent.clear(editor())
    await userEvent.type(editor(), keystrokes("[('abandoned'"))
    rerender(<OdooRawDomainDialog {...props({ open: false, rawDomain: RAF_DOMAIN })} />)
    rerender(<OdooRawDomainDialog {...props({ open: true, rawDomain: RAF_DOMAIN })} />)

    // Half-typed text is not the formatting of any domain, so it is not kept.
    expect(editor()).toHaveValue("[\n  ('s_raf', '>', 0)\n]")
  })
})
