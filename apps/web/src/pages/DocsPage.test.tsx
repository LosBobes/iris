// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import DocsPage from './DocsPage'
import { DOC_CHAPTERS } from '@/components/docs/chapters'
import { sr } from '@/i18n/locales/sr'
import { NO_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

afterEach(cleanup)

function renderDocs(path: string, modules = NO_MODULES) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WithModules modules={modules}>
        <Routes>
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:chapterId" element={<DocsPage />} />
        </Routes>
      </WithModules>
    </MemoryRouter>,
  )
}

describe('DocsPage', () => {
  it('lists every chapter on the index', () => {
    renderDocs('/docs')
    expect(screen.getByRole('heading', { level: 1, name: sr.docs.title })).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: sr.docs.contents })
    for (const chapter of DOC_CHAPTERS) {
      expect(within(toc).getByRole('link', { name: chapter.title })).toHaveAttribute('href', `/docs/${chapter.id}`)
    }
  })

  it.each(DOC_CHAPTERS.map((chapter) => [chapter.id, chapter] as const))(
    'renders the %s chapter',
    (_id, chapter) => {
      renderDocs(`/docs/${chapter.id}`)
      expect(screen.getByRole('heading', { level: 2, name: chapter.title })).toBeInTheDocument()
      // Diagrams are labelled images; every chapter but the glossary has at least one.
      if (chapter.id !== 'recnik') {
        expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
      }
    },
  )

  it('links to the neighbouring chapters', () => {
    renderDocs(`/docs/${DOC_CHAPTERS[1].id}`)
    const pager = screen.getByRole('navigation', { name: sr.docs.pager })
    expect(within(pager).getByRole('link', { name: new RegExp(DOC_CHAPTERS[0].title) })).toHaveAttribute(
      'href',
      `/docs/${DOC_CHAPTERS[0].id}`,
    )
    expect(within(pager).getByRole('link', { name: new RegExp(DOC_CHAPTERS[2].title) })).toHaveAttribute(
      'href',
      `/docs/${DOC_CHAPTERS[2].id}`,
    )
  })

  it('falls back to the index for an unknown chapter', () => {
    renderDocs('/docs/does-not-exist')
    expect(screen.getByText(sr.docs.startTitle)).toBeInTheDocument()
  })

  it('says whether a module chapter is enabled for the organization', () => {
    renderDocs('/docs/magacin', STOCK_ONLY)
    expect(screen.getByText(sr.docs.moduleOn)).toBeInTheDocument()
    cleanup()
    renderDocs('/docs/planiranje', STOCK_ONLY)
    expect(screen.getByText(sr.docs.moduleOff)).toBeInTheDocument()
  })

  it('filters the glossary, ignoring diacritics', async () => {
    renderDocs('/docs/recnik')
    expect(screen.getByText('Marža')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Pretraga rečnika' }), 'ceka')
    expect(screen.getByText('Čeka unos troška')).toBeInTheDocument()
    expect(screen.queryByText('Marža')).not.toBeInTheDocument()
  })
})
