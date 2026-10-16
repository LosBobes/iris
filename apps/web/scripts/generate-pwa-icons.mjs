// Renders the PWA / home-screen icons in public/ from the brand mark.
//
// The PNGs are committed, so this only needs re-running when the mark
// changes: `node scripts/generate-pwa-icons.mjs` (from apps/web/). It uses
// the Playwright Chromium already in devDependencies to rasterize the SVG.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BACKGROUND = '#f7f3eb'

// Same strokes as public/favicon.svg, on the 48x48 grid.
const MARK = `
  <path d="M24 30 V44" stroke="#36302a" stroke-width="2.4"/>
  <path d="M24 29 C19 23 19 13 24 7 C29 13 29 23 24 29 Z" stroke="#c46a32" stroke-width="2.4"/>
  <path d="M24 29 C18 26 13 27 10 33" stroke="#36302a" stroke-width="2.4"/>
  <path d="M24 29 C30 26 35 27 38 33" stroke="#36302a" stroke-width="2.4"/>`

// `scale` shrinks the mark around the centre. Android crops maskable icons to
// a circle/squircle covering only the middle 80%, so that variant gets more
// padding; iOS rounds the corners of apple-touch-icon itself, which only
// needs a little breathing room.
function svg(size, scale) {
  const offset = (48 - 48 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <rect width="48" height="48" fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
</svg>`
}

const ICONS = [
  { file: 'public/icons/icon-192.png', size: 192, scale: 0.85 },
  { file: 'public/icons/icon-512.png', size: 512, scale: 0.85 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: 0.6 },
  { file: 'public/apple-touch-icon.png', size: 180, scale: 0.8 },
]

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
)
try {
  const page = await browser.newPage()
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size })
    await page.setContent(
      `<html><body style="margin:0">${svg(icon.size, icon.scale)}</body></html>`,
    )
    const out = resolve(root, icon.file)
    mkdirSync(dirname(out), { recursive: true })
    await page.locator('svg').screenshot({ path: out, omitBackground: false })
    console.log(`wrote ${icon.file} (${icon.size}x${icon.size})`)
  }
} finally {
  await browser.close()
}
