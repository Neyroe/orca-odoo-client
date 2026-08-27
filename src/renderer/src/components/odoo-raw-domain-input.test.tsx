// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OdooRawDomainInput } from './odoo-raw-domain-input'
import { DEFAULT_ODOO_TICKET_FILTERS } from './odoo-ticket-facets'
import type { OdooDomain } from '../../../shared/odoo-types'

const RAF_DOMAIN: OdooDomain = [['s_raf', '>', 0]]
const RAF_TEXT = "[('s_raf', '>', 0)]"

type InputProps = React.ComponentProps<typeof OdooRawDomainInput>

function props(overrides: Partial<InputProps>): InputProps {
  return {
    rawDomain: null,
    filters: DEFAULT_ODOO_TICKET_FILTERS,
    viewerUid: 180,
    filtersActive: true,
    onApply: vi.fn(),
    ...overrides
  }
}

function box(): HTMLInputElement {
  return screen.getByLabelText('Odoo domain') as HTMLInputElement
}

/** user-event reads `[` and `{` as key descriptors; doubling types the literal. */
function keystrokes(text: string): string {
  return text.replace(/[[{]/g, (char) => char + char)
}

afterEach(cleanup)

describe('OdooRawDomainInput', () => {
  it('shows the domain the read is running on, in Odoo notation', () => {
    render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN })} />)

    expect(box()).toHaveValue(RAF_TEXT)
  })

  it('applies nothing while the domain is being typed', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ onApply })} />)

    await userEvent.type(box(), keystrokes(RAF_TEXT))

    // A read per keystroke would spend a 500-entry cache on half-typed domains.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applies on Enter', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ onApply })} />)

    await userEvent.type(box(), `${keystrokes(RAF_TEXT)}{Enter}`)

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(RAF_DOMAIN)
  })

  it('applies on blur', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ onApply })} />)

    await userEvent.type(box(), keystrokes(RAF_TEXT))
    await userEvent.tab()

    expect(onApply).toHaveBeenCalledWith(RAF_DOMAIN)
  })

  it('still reads the JSON a saved filter was written as', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ onApply })} />)

    await userEvent.type(box(), `${keystrokes('[["s_raf", ">", 0]]')}{Enter}`)

    expect(onApply).toHaveBeenCalledWith(RAF_DOMAIN)
  })

  it('clears the raw domain when the box is emptied', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN, onApply })} />)

    await userEvent.clear(box())
    await userEvent.tab()

    expect(onApply).toHaveBeenCalledWith(null)
  })

  it('stays quiet when an untouched box loses focus', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN, onApply })} />)

    await userEvent.click(box())
    await userEvent.tab()

    // Blur fires on any incidental focus loss; re-applying the same domain would
    // restart the read once its cache entry has aged past the TTL.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('shows the validator message verbatim and leaves the read alone', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN, onApply })} />)

    await userEvent.clear(box())
    await userEvent.type(box(), `${keystrokes("['&', ('s_raf', '>', 0)]")}{Enter}`)

    expect(
      screen.getByText('The "&" operator at position 0 is missing an operand.')
    ).toBeInTheDocument()
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    // The list on screen still answers the question it was read for.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('situates a syntax problem by character', async () => {
    render(<OdooRawDomainInput {...props({})} />)

    await userEvent.type(box(), `${keystrokes("[('s_raf', '>', 0)")}{Enter}`)

    expect(screen.getByText('The "[" opened at character 1 is never closed.')).toBeInTheDocument()
  })

  it('drops the error once a readable domain replaces it', async () => {
    render(<OdooRawDomainInput {...props({})} />)

    await userEvent.type(box(), `${keystrokes("[('s_raf', '>'")}{Enter}`)
    expect(box()).toHaveAttribute('aria-invalid', 'true')

    await userEvent.clear(box())
    await userEvent.type(box(), `${keystrokes(RAF_TEXT)}{Enter}`)

    expect(box()).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText(/never closed|must read/)).not.toBeInTheDocument()
  })

  it('goes inert while a title search drives the read', () => {
    render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN, filtersActive: false })} />)

    // The search replaces the compiled domain, so an editable box would read as
    // describing rows this domain had no part in selecting.
    expect(box()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add custom domain' })).toBeDisabled()
  })

  it('drops a pending error when a title search takes the read over', async () => {
    const { rerender } = render(<OdooRawDomainInput {...props({})} />)
    await userEvent.type(box(), `${keystrokes("[('s_raf', '>'")}{Enter}`)
    expect(box()).toHaveAttribute('aria-invalid', 'true')

    rerender(<OdooRawDomainInput {...props({ filtersActive: false })} />)

    expect(screen.queryByText(/never closed/)).not.toBeInTheDocument()
  })

  it('follows the domain a preset chip writes from outside', () => {
    const { rerender } = render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN })} />)

    rerender(<OdooRawDomainInput {...props({ rawDomain: [['state', '=', '01_in_progress']] })} />)

    expect(box()).toHaveValue("[('state', '=', '01_in_progress')]")
  })

  it('opens the editor for a domain that has outgrown one line', async () => {
    render(<OdooRawDomainInput {...props({ rawDomain: RAF_DOMAIN })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add custom domain' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Custom domain')).toBeInTheDocument()
  })
})
