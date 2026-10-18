// @vitest-environment jsdom
// Sign-in screens must scroll on a small phone (or with the on-screen keyboard
// open) instead of clipping the form. jsdom does no layout, so this pins the
// structure that makes it work: an .iris-screen scroll container (fixed, with
// overflow-y: auto) around a min-h-full frame that centers the content and is
// free to grow, with nothing in between that clips.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { LoginShell } from './LoginShell'
import { BackofficeScreen } from '@/components/platform/BackofficeScreen'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function cssRule(selector: string): string {
  const css = readFileSync(resolve(__dirname, '../../assets/main.css'), 'utf8')
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

function expectScrollableScreen(screenElement: HTMLElement): void {
  expect(screenElement).toHaveClass('iris-screen')
  const frame = screenElement.firstElementChild as HTMLElement
  expect(frame).toHaveClass('min-h-full')
  // Nothing between the scroll container and the content may clip it.
  for (let node: HTMLElement | null = frame; node; node = node.firstElementChild as HTMLElement | null) {
    expect(node.className).not.toMatch(/\boverflow-hidden\b|\bmax-h-full\b|\bh-screen\b/)
  }
}

describe('scrollable sign-in screens', () => {
  it('.iris-screen is a vertical scroll container sized to the dynamic viewport', () => {
    const rule = cssRule('.iris-screen')
    expect(rule).toMatch(/overflow-y:\s*auto/)
    expect(rule).toMatch(/height:\s*calc\(100dvh/)
    expect(rule).not.toMatch(/overflow:\s*hidden/)
  })

  it('the viewport lets the on-screen keyboard resize the layout', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')
    expect(html).toMatch(/name="viewport"[^>]*interactive-widget=resizes-content/)
  })

  it('the organization and sign-in steps scroll', () => {
    vi.stubGlobal('api', { getAppVersion: vi.fn(async () => '2.3.0') })
    render(
      <MemoryRouter>
        <LoginShell>
          <form />
        </LoginShell>
      </MemoryRouter>,
    )
    expectScrollableScreen(screen.getByTestId('login-screen'))
  })

  it('the Backoffice sign-in and password screens scroll', () => {
    render(
      <BackofficeScreen>
        <form />
      </BackofficeScreen>,
    )
    expectScrollableScreen(screen.getByTestId('backoffice-screen'))
  })
})
