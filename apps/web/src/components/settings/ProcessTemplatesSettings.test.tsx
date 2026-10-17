// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProcessTemplatesSettings } from './ProcessTemplatesSettings'
import type { ProcessTemplate } from '@/types/process'
import '@/i18n'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

function template(id: string, name: string, isDefault: boolean, steps: number): ProcessTemplate {
  return {
    id,
    name,
    description: '',
    isDefault,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    graph: {
      nodes: Array.from({ length: steps }, (_, i) => ({
        id: `s${i}`,
        kind: 'step' as const,
        label: `Korak ${i}`,
        x: 0,
        y: 0,
      })),
      edges: [],
    },
  }
}

const offset = template('t1', 'Offset štampa', true, 4)
const digital = template('t2', 'Digitalna štampa', false, 2)

function renderSettings(): void {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<ProcessTemplatesSettings />} />
        <Route path="/settings/processes/new" element={<div>new template page</div>} />
        <Route path="/settings/processes/:id" element={<div>edit template page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProcessTemplatesSettings', () => {
  it('lists templates with the default badge and step counts', async () => {
    vi.stubGlobal('api', { getProcessTemplates: vi.fn().mockResolvedValue([offset, digital]) })
    renderSettings()

    expect(await screen.findByText('Offset štampa')).toBeInTheDocument()
    expect(screen.getByText('Digitalna štampa')).toBeInTheDocument()
    expect(screen.getByText('Podrazumevani', { selector: '[data-slot="badge"]' })).toBeInTheDocument()
    expect(screen.getByText('Koraka: 4')).toBeInTheDocument()
    expect(screen.getByText('Koraka: 2')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    vi.stubGlobal('api', { getProcessTemplates: vi.fn().mockResolvedValue([]) })
    renderSettings()
    expect(await screen.findByText('Još nema procesa rada.')).toBeInTheDocument()
  })

  it('opens the editor routes for create and edit', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('api', { getProcessTemplates: vi.fn().mockResolvedValue([offset]) })
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Novi proces' }))
    expect(await screen.findByText('new template page')).toBeInTheDocument()
  })

  it('navigates to the edit page', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('api', { getProcessTemplates: vi.fn().mockResolvedValue([offset]) })
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Izmeni proces „Offset štampa“' }))
    expect(await screen.findByText('edit template page')).toBeInTheDocument()
  })

  it('sets another template as default', async () => {
    const user = userEvent.setup()
    const getProcessTemplates = vi
      .fn()
      .mockResolvedValueOnce([offset, digital])
      .mockResolvedValueOnce([{ ...digital, isDefault: true }, { ...offset, isDefault: false }])
    const updateProcessTemplate = vi.fn().mockResolvedValue({})
    vi.stubGlobal('api', { getProcessTemplates, updateProcessTemplate })
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Postavi „Digitalna štampa“ kao podrazumevani proces' }))

    await waitFor(() =>
      expect(updateProcessTemplate).toHaveBeenCalledWith('t2', expect.objectContaining({ isDefault: true, name: 'Digitalna štampa' })),
    )
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('asks for confirmation before deleting', async () => {
    const user = userEvent.setup()
    const getProcessTemplates = vi.fn().mockResolvedValueOnce([offset, digital]).mockResolvedValueOnce([offset])
    const deleteProcessTemplate = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('api', { getProcessTemplates, deleteProcessTemplate })
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Obriši proces „Digitalna štampa“' }))
    expect(deleteProcessTemplate).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Obriši' }))

    await waitFor(() => expect(deleteProcessTemplate).toHaveBeenCalledWith('t2'))
    await waitFor(() => expect(screen.queryByText('Digitalna štampa')).not.toBeInTheDocument())
  })

  it('reports a delete failure', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('api', {
      getProcessTemplates: vi.fn().mockResolvedValue([offset]),
      deleteProcessTemplate: vi.fn().mockRejectedValue(new Error('Potrebna je administratorska uloga.')),
    })
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Obriši proces „Offset štampa“' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Obriši' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Potrebna je administratorska uloga.')))
  })
})
