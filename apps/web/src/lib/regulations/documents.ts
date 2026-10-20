// The public regulations guide (/home/propisi): the Serbian Markdown documents in
// docs/drzavne-integracije, bundled at build time. The repository copy is the
// single source; sections fenced with <!-- interno --> … <!-- /interno --> (Iris
// planning notes, issue references) are for the team and never shown publicly.

import overview from '@regulation-docs/README.md?raw'
import einvoices from '@regulation-docs/01-elektronske-fakture-sef.md?raw'
import dispatchNotes from '@regulation-docs/02-elektronske-otpremnice.md?raw'
import fiscalization from '@regulation-docs/03-fiskalizacija.md?raw'
import sources from '@regulation-docs/IZVORI.md?raw'

import { REGULATIONS_BASE_PATH } from './paths'

export { REGULATIONS_BASE_PATH }

export interface RegulationDoc {
  /** URL segment under REGULATIONS_BASE_PATH; empty for the overview. */
  slug: string
  /** File name in docs/drzavne-integracije, used to resolve links between documents. */
  file: string
  /** Short label for the document list. */
  label: string
  /** The document's own title (its first "# " heading). */
  title: string
  /** Public Markdown: internal sections removed, title heading dropped (rendered separately). */
  markdown: string
}

const INTERNAL_SECTION = /<!--\s*interno\s*-->[\s\S]*?<!--\s*\/interno\s*-->\n?/g

const HTML_COMMENT = /<!--[\s\S]*?-->\n?/g

/**
 * Removes every <!-- interno --> … <!-- /interno --> block, then any remaining
 * HTML comment (maintainer notes, which react-markdown would otherwise print as
 * text), and tidies the blank lines left behind.
 */
export function stripInternalSections(markdown: string): string {
  return (
    markdown
      .replace(INTERNAL_SECTION, '')
      .replace(HTML_COMMENT, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

function splitTitle(markdown: string): { title: string; body: string } {
  const match = /^# (.+)\n/m.exec(markdown)
  if (!match) return { title: '', body: markdown }
  return { title: match[1]!.trim(), body: markdown.slice(0, match.index) + markdown.slice(match.index + match[0].length) }
}

function buildDoc(slug: string, file: string, label: string, raw: string): RegulationDoc {
  const { title, body } = splitTitle(stripInternalSections(raw))
  return { slug, file, label, title, markdown: body.trimStart() }
}

export const REGULATION_DOCS: RegulationDoc[] = [
  buildDoc('', 'README.md', 'Pregled', overview),
  buildDoc('elektronske-fakture', '01-elektronske-fakture-sef.md', 'Elektronske fakture (SEF)', einvoices),
  buildDoc('elektronske-otpremnice', '02-elektronske-otpremnice.md', 'Elektronske otpremnice', dispatchNotes),
  buildDoc('fiskalizacija', '03-fiskalizacija.md', 'Fiskalizacija', fiscalization),
  buildDoc('izvori', 'IZVORI.md', 'Izvori', sources),
]

export function regulationDocPath(doc: RegulationDoc): string {
  return doc.slug ? `${REGULATIONS_BASE_PATH}/${doc.slug}` : REGULATIONS_BASE_PATH
}

export function findRegulationDoc(slug: string | undefined): RegulationDoc | undefined {
  return REGULATION_DOCS.find((doc) => doc.slug === (slug ?? ''))
}

/**
 * Maps a link inside a document to where it should go on the site: another
 * document of the guide ("02-elektronske-otpremnice.md#rokovi") becomes its
 * route, anything else is returned unchanged.
 */
export function resolveRegulationHref(href: string): string {
  const [path, hash] = href.split('#', 2) as [string, string | undefined]
  const target = REGULATION_DOCS.find((doc) => doc.file === path)
  if (!target) return href
  return regulationDocPath(target) + (hash ? `#${hash}` : '')
}

/**
 * GitHub-style heading anchor ("Otvorena pitanja" → "otvorena-pitanja"), so the
 * in-document links written for the repository work on the site too. Letters
 * with diacritics are kept, as GitHub does.
 */
export function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}
