// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { UpdateBanner } from './UpdateBanner'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UpdateBanner', () => {
  it('renders nothing while no update is known', () => {
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the new version and reloads on request', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<UpdateBanner version="2.23.0" />)

    expect(screen.getByRole('status')).toHaveTextContent('v2.23.0')
    await userEvent.click(screen.getByRole('button', { name: 'Osveži' }))
    expect(reload).toHaveBeenCalled()
  })
})
