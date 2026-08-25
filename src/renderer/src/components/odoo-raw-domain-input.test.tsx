// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OdooRawDomainInput } from './odoo-raw-domain-input'
import type { OdooDomain } from '../../../shared/odoo-types'

const RAF_DOMAIN: OdooDomain = [['s_raf', '>', 0]]
const RAF_TEXT = '[["s_raf", ">", 0]]'

function box(): HTMLInputElement {
  return screen.getByLabelText('Odoo domain') as HTMLInputElement
}

/** user-event reads `[` and `{` as key descriptors; doubling types the literal. */
function keystrokes(text: string): string {
  return text.replace(/[[{]/g, (char) => char + char)
}

afterEach(cleanup)

describe('OdooRawDomainInput', () => {
  it('shows the domain the read is running on', () => {
    render(<OdooRawDomainInput filtersActive rawDomain={RAF_DOMAIN} onApply={vi.fn()} />)

    expect(box()).toHaveValue('[["s_raf",">",0]]')
  })

  it('applies nothing while the domain is being typed', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput filtersActive rawDomain={null} onApply={onApply} />)

    await userEvent.type(box(), keystrokes(RAF_TEXT))

    // A read per keystroke would spend a 500-entry cache on half-typed domains.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applies on Enter', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput filtersActive rawDomain={null} onApply={onApply} />)

    await userEvent.type(box(), `${keystrokes(RAF_TEXT)}{Enter}`)

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(RAF_DOMAIN)
  })

  it('applies on blur', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput filtersActive rawDomain={null} onApply={onApply} />)

    await userEvent.type(box(), keystrokes(RAF_TEXT))
    await userEvent.tab()

    expect(onApply).toHaveBeenCalledWith(RAF_DOMAIN)
  })

  it('clears the raw domain when the box is emptied', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput filtersActive rawDomain={RAF_DOMAIN} onApply={onApply} />)

    await userEvent.clear(box())
    await userEvent.tab()

    expect(onApply).toHaveBeenCalledWith(null)
  })

  it('stays quiet when an untouched box loses focus', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput filtersActive rawDomain={RAF_DOMAIN} onApply={onApply} />)

    await userEvent.click(box())
    await userEvent.tab()

    // Blur fires on any incidental focus loss; re-applying the same domain would
    // restart the read once its cache entry has aged past the TTL.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('shows the validator message verbatim and leaves the read alone', async () => {
    const onApply = vi.fn()
    render(<OdooRawDomainInput filtersActive rawDomain={RAF_DOMAIN} onApply={onApply} />)

    await userEvent.clear(box())
    await userEvent.type(box(), `${keystrokes('["&", ["s_raf", ">", 0]]')}{Enter}`)

    expect(
      screen.getByText('The "&" operator at position 0 is missing an operand.')
    ).toBeInTheDocument()
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    // The list on screen still answers the question it was read for.
    expect(onApply).not.toHaveBeenCalled()
  })

  it('drops the error once a readable domain replaces it', async () => {
    render(<OdooRawDomainInput filtersActive rawDomain={null} onApply={vi.fn()} />)

    await userEvent.type(box(), `${keystrokes('[["s_raf", ">"')}{Enter}`)
    expect(box()).toHaveAttribute('aria-invalid', 'true')

    await userEvent.clear(box())
    await userEvent.type(box(), `${keystrokes(RAF_TEXT)}{Enter}`)

    expect(box()).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText(/is not valid|must read|Write the domain/)).not.toBeInTheDocument()
  })

  it('goes inert while a title search drives the read', () => {
    render(<OdooRawDomainInput filtersActive={false} rawDomain={RAF_DOMAIN} onApply={vi.fn()} />)

    // The search replaces the compiled domain, so an editable box would read as
    // describing rows this domain had no part in selecting.
    expect(box()).toBeDisabled()
  })

  it('drops a pending error when a title search takes the read over', async () => {
    const { rerender } = render(
      <OdooRawDomainInput filtersActive rawDomain={null} onApply={vi.fn()} />
    )
    await userEvent.type(box(), `${keystrokes('[["s_raf", ">"')}{Enter}`)
    expect(box()).toHaveAttribute('aria-invalid', 'true')

    rerender(<OdooRawDomainInput filtersActive={false} rawDomain={null} onApply={vi.fn()} />)

    expect(screen.queryByText(/Write the domain as JSON/)).not.toBeInTheDocument()
  })

  it('follows the domain a preset chip writes from outside', () => {
    const { rerender } = render(
      <OdooRawDomainInput filtersActive rawDomain={RAF_DOMAIN} onApply={vi.fn()} />
    )

    rerender(
      <OdooRawDomainInput
        filtersActive
        rawDomain={[['state', '=', '01_in_progress']]}
        onApply={vi.fn()}
      />
    )

    expect(box()).toHaveValue('[["state","=","01_in_progress"]]')
  })
})
