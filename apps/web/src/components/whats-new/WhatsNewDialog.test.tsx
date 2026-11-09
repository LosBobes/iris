// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { sr } from '@/i18n/locales/sr'
import { WHATS_NEW } from '@/lib/whats-new'
import { WhatsNewDialog } from './WhatsNewDialog'
import '@/i18n'

afterEach(cleanup)

const strings = sr.whatsNew

describe('WhatsNewDialog', () => {
  it('steps through the entries with the buttons always laid out', async () => {
    const onClose = vi.fn()
    render(<WhatsNewDialog entries={WHATS_NEW.slice(0, 2)} onClose={onClose} />)
    const first = strings.entries[WHATS_NEW[0].id].title
    const second = strings.entries[WHATS_NEW[1].id].title

    expect(screen.getByRole('heading', { name: first })).toBeInTheDocument()
    // Every page's words are laid out (so the dialog keeps one height), only one is exposed.
    expect(screen.queryByRole('heading', { name: second })).toBeNull()
    expect(screen.getByText(second).closest('[aria-hidden="true"]')).toHaveClass('invisible')
    // Back keeps its slot on the first page, hidden and inert.
    const back = screen.getByText(strings.back).closest('button')!
    expect(back).toBeDisabled()
    expect(back).toHaveClass('invisible')

    await userEvent.click(screen.getByRole('button', { name: strings.next }))
    expect(screen.getByRole('heading', { name: second })).toBeInTheDocument()
    expect(screen.getByText(strings.step.replace('{{current}}', '2').replace('{{total}}', '2'))).toBeInTheDocument()
    expect(back).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: strings.done }))
    expect(onClose).toHaveBeenCalled()
  })
})
