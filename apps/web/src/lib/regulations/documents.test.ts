import { describe, expect, it } from 'vitest'
import {
  findRegulationDoc,
  headingId,
  REGULATION_DOCS,
  resolveRegulationHref,
  stripInternalSections,
} from './documents'

describe('stripInternalSections', () => {
  it('removes fenced team notes and the blank lines they leave', () => {
    const markdown = 'Uvod\n\n<!-- interno -->\n## Za tim\n\nPIN-1\n<!-- /interno -->\n\n## Javno\n'
    expect(stripInternalSections(markdown)).toBe('Uvod\n\n## Javno\n')
  })

  it('drops maintainer comments too', () => {
    expect(stripInternalSections('<!--\nNapomena za tim.\n-->\n# Naslov\n\nTekst\n')).toBe('# Naslov\n\nTekst\n')
  })
})

describe('REGULATION_DOCS', () => {
  it('has a title and public text for every document', () => {
    for (const doc of REGULATION_DOCS) {
      expect(doc.title, doc.file).not.toBe('')
      expect(doc.markdown.length, doc.file).toBeGreaterThan(200)
      expect(doc.markdown, doc.file).not.toMatch(/^# /m)
    }
  })

  it('never shows team-only notes (issue numbers, the pilot organization, planning)', () => {
    for (const doc of REGULATION_DOCS) {
      expect(doc.markdown, doc.file).not.toMatch(/<!--|-->|PIN-\d|Linear|PR #|Grafika|Šta ovo znači za Iris/)
    }
  })

  it('links only to documents of the guide and to headings that exist', () => {
    for (const doc of REGULATION_DOCS) {
      const ids = new Set([...doc.markdown.matchAll(/^#{2,4} (.+)$/gm)].map((match) => headingId(match[1]!)))
      for (const [, href] of doc.markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^https?:\/\//.test(href!)) continue
        if (href!.startsWith('#')) {
          expect(ids.has(href!.slice(1)), `${doc.file}: ${href}`).toBe(true)
        } else {
          expect(resolveRegulationHref(href!), `${doc.file}: ${href}`).toMatch(/^\/home\/propisi/)
        }
      }
    }
  })
})

describe('links and anchors', () => {
  it('maps repository file links to routes and leaves the rest alone', () => {
    expect(resolveRegulationHref('03-fiskalizacija.md')).toBe('/home/propisi/fiskalizacija')
    expect(resolveRegulationHref('02-elektronske-otpremnice.md#kazne')).toBe('/home/propisi/elektronske-otpremnice#kazne')
    expect(resolveRegulationHref('README.md')).toBe('/home/propisi')
    expect(resolveRegulationHref('https://purs.gov.rs/')).toBe('https://purs.gov.rs/')
    expect(resolveRegulationHref('#otvorena-pitanja')).toBe('#otvorena-pitanja')
  })

  it('builds GitHub-style heading ids, keeping Serbian letters', () => {
    expect(headingId('Otvorena pitanja')).toBe('otvorena-pitanja')
    expect(headingId('7. Kazne (čl. 13–14 ⚠️ brojevi iz izvoda)')).toBe('7-kazne-čl-1314--brojevi-iz-izvoda')
  })

  it('finds documents by slug, the overview without one', () => {
    expect(findRegulationDoc(undefined)?.file).toBe('README.md')
    expect(findRegulationDoc('izvori')?.file).toBe('IZVORI.md')
    expect(findRegulationDoc('nema')).toBeUndefined()
  })
})
