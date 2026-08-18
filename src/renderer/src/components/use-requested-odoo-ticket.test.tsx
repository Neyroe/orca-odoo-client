// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  fetchOdooTicket: vi.fn(async (_id: number, _instanceId?: string | null) => null as unknown)
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: object) => unknown) => selector(testState)
}))

import { useRequestedOdooTicket } from './use-requested-odoo-ticket'

const ticket = { id: 45441, ref: '#45441', title: 'Anticipate Trucks for NA' }

function Probe({
  request,
  onLoaded
}: {
  request: { id: number; instanceId?: string } | null
  onLoaded: (t: unknown) => void
}): null {
  useRequestedOdooTicket(request as never, onLoaded as never)
  return null
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  testState.fetchOdooTicket = vi.fn(async () => ticket as unknown)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(
  request: { id: number; instanceId?: string } | null,
  onLoaded: (t: unknown) => void
): Promise<void> {
  await act(async () => {
    root.render(createElement(Probe, { request, onLoaded }))
  })
}

describe('useRequestedOdooTicket', () => {
  it('reads the requested ticket on its instance and hands it over', async () => {
    const onLoaded = vi.fn()
    await render({ id: 45441, instanceId: 'instance-1' }, onLoaded)
    expect(testState.fetchOdooTicket).toHaveBeenCalledWith(45441, 'instance-1')
    expect(onLoaded).toHaveBeenCalledWith(ticket)
  })

  it('passes null instead of an instance when the request carries none', async () => {
    await render({ id: 45441 }, vi.fn())
    expect(testState.fetchOdooTicket).toHaveBeenCalledWith(45441, null)
  })

  it('reads nothing when there is no request', async () => {
    await render(null, vi.fn())
    expect(testState.fetchOdooTicket).not.toHaveBeenCalled()
  })

  it('does not re-read while the request keeps the same id and instance', async () => {
    const onLoaded = vi.fn()
    await render({ id: 45441, instanceId: 'instance-1' }, onLoaded)
    // A fresh object with identical values — what a re-rendering caller passes.
    await render({ id: 45441, instanceId: 'instance-1' }, onLoaded)
    expect(testState.fetchOdooTicket).toHaveBeenCalledTimes(1)
  })

  it('keeps quiet when the read fails', async () => {
    testState.fetchOdooTicket = vi.fn(async () => {
      throw new Error('AccessDenied')
    })
    const onLoaded = vi.fn()
    await render({ id: 45441 }, onLoaded)
    expect(onLoaded).not.toHaveBeenCalled()
  })
})
