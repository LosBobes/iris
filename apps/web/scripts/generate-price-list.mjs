// Renders the landing page's price list as an A4 PDF in public/cenovnik-iris.pdf
// (linked from the "Cenovnik" section) from src/lib/home/pricing.json, the same
// data `PricingPlans` shows, and records the data's hash in
// src/lib/home/price-list.stamp.json. A test compares that hash with
// pricing.json, so after any price change run, from apps/web/:
//
//   node scripts/generate-price-list.mjs
//
// It uses the Playwright Chromium already in devDependencies (IRIS_CHROME_PATH
// pins another Chromium binary, as for the invoices). The contact
// e-mail follows the landing page (VITE_HOME_CONTACT_EMAIL or its default).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pricingPath = resolve(root, 'src/lib/home/pricing.json')
const pricing = JSON.parse(readFileSync(pricingPath, 'utf8'))

// The provider's details in the PDF header. Empty fields are left out.
const SELLER = {
  name: 'Pingwin Software',
  activity: 'Računarsko programiranje',
  address: '',
  phone: '',
  email: process.env.VITE_HOME_CONTACT_EMAIL?.trim() || 'vladbatocanin@gmail.com',
}

// The penguin from the invoice, so both documents carry the same mark.
const logoSvg = readFileSync(resolve(root, '../../iris-api/internal/invoice/pingwin-logo.svg'))
const logo = `data:image/svg+xml;base64,${logoSvg.toString('base64')}`

const rsd = new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 })
const money = (n) => `${rsd.format(n)} RSD`
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const today = new Date()
const updated = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}.`

const sellerLines = [SELLER.address, SELLER.phone && `Tel: ${SELLER.phone}`, SELLER.email]
  .filter(Boolean)
  .map(esc)
  .join('<br>')

const html = `<!doctype html>
<html lang="sr-Latn"><head><meta charset="utf-8"><title>Cenovnik Iris</title>
<style>
  /* Pingwin Software's palette and penguin, as on its invoices (iris-api/internal/invoice). */
  :root { --ink: #241f86; --accent: #2e43fe; --muted: #5e5f92; --line: #d4d6f3; --soft: #eff0ff; }
  @page { size: A4; margin: 15mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif; font-size: 9.4pt; color: #1c1b3a; line-height: 1.45; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid var(--ink); padding-bottom: 8px; }
  .accent-bar { height: 3px; width: 64px; background: var(--accent); margin-top: -3px; }
  .brand { display: flex; gap: 10px; align-items: center; }
  .brand img { width: 50px; height: auto; flex: none; }
  .brand-name { font-size: 17pt; font-weight: 700; color: var(--ink); letter-spacing: 0.3px; line-height: 1; }
  .brand-name span { color: var(--accent); }
  .brand-legal { font-size: 7.6pt; color: var(--muted); margin-top: 3px; text-transform: uppercase; }
  .seller { text-align: right; font-size: 8pt; color: #2e2d55; line-height: 1.45; }
  h1 { font-size: 17pt; color: var(--ink); margin: 14px 0 2px; }
  .sub { color: var(--muted); }
  h2 { font-size: 11.5pt; color: var(--ink); margin: 13px 0 3px; }
  .lead { color: var(--muted); margin: 0 0 7px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7.6pt; background: var(--ink); color: #fff; font-weight: 700; padding: 5px 6px; }
  td { padding: 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f7f7ff; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.num { font-weight: 700; color: var(--ink); }
  .plan { font-weight: 700; color: var(--ink); }
  .tag, .inc { display: block; color: var(--muted); font-size: 8.4pt; }
  .inc { color: #1c1b3a; margin-top: 2px; }
  tbody tr.hl td { background: var(--soft); }
  tr.hl td:first-child { border-left: 4px solid var(--accent); }
  .note { font-size: 8.6pt; color: var(--muted); margin-top: 6px; }
  .cols { display: flex; gap: 16px; }
  .cols > section { flex: 1; }
  ul { margin: 0; padding-left: 16px; }
  li { margin-bottom: 4px; }
  li::marker { color: var(--accent); }
  .keep { break-inside: avoid; }
  footer { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 7px; display: flex; justify-content: space-between; font-size: 7.8pt; color: var(--muted); }
</style></head><body>
<header>
  <div class="brand">
    <img src="${logo}" alt="Pingwin">
    <div><div class="brand-name">Pingwin <span>Software</span></div><div class="brand-legal">${esc(SELLER.activity)}</div></div>
  </div>
  <div class="seller">${sellerLines}</div>
</header>
<div class="accent-bar"></div>

<h1>Cenovnik Iris</h1>
<div class="sub">Pretplata, uvođenje, podrška i dorade · ažurirano ${updated}</div>

<section class="keep">
<h2>Paketi pretplate</h2>
<p class="lead">Pretplata je po firmi i uključuje korisnike, podršku i nove verzije. Uvođenje se plaća jednom.</p>
<table>
  <thead><tr><th>Paket</th><th class="num">Mesečno</th><th class="num">Godišnje</th><th class="num">Korisnika</th><th class="num">Uvođenje</th></tr></thead>
  <tbody>
  ${pricing.plans
    .map(
      (p) => `<tr class="${p.highlighted ? 'hl' : ''}">
    <td><span class="plan">${esc(p.name)}</span><span class="tag">${esc(p.tagline)}</span><span class="inc">${p.includes.map(esc).join(' · ')}</span></td>
    <td class="num">${money(p.monthly)}</td><td class="num">${money(p.annual)}</td>
    <td class="num">do ${p.users}</td><td class="num">${money(p.onboarding)}</td></tr>`,
    )
    .join('')}
  </tbody>
</table>
<p class="note">${esc(pricing.terms)} Godišnja pretplata je cena 10 meseci za 12.</p>
</section>

<div class="cols keep">
<section>
<h2>Period usvajanja</h2>
<p class="lead">Posle početka rada manje izmene radimo besplatno, u okviru fonda sati.</p>
<table>
  <thead><tr><th>Paket</th><th>Trajanje</th><th class="num">Sati</th></tr></thead>
  <tbody>${pricing.adoption
    .map((r) => `<tr><td>${esc(r.plan)}</td><td>${r.days} dana</td><td class="num">${r.hours} h</td></tr>`)
    .join('')}</tbody>
</table>
</section>
<section>
<h2>Podrška</h2>
<p class="lead">Uključena u svaki paket.</p>
<ul>${pricing.support.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
</section>
</div>

<section class="keep">
<h2>Dorade i usluge</h2>
<p class="lead">Za veće dorade dajemo fiksnu ponudu pre početka rada.</p>
<table>
  <thead><tr><th>Usluga</th><th class="num">Cena</th></tr></thead>
  <tbody>${pricing.changes
    .map((c) => `<tr><td>${esc(c.label)}</td><td class="num">${esc(c.price)}</td></tr>`)
    .join('')}</tbody>
</table>
</section>

<footer>
  <span>${esc(SELLER.name)} · ${esc(SELLER.email)}</span>
  <span>Iris · operativni sistem za proizvodne i uslužne radnje</span>
</footer>
</body></html>`

const browser = await chromium.launch({ executablePath: process.env.IRIS_CHROME_PATH || undefined })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({
  path: resolve(root, 'public/cenovnik-iris.pdf'),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
})
await browser.close()

const pricingSha256 = createHash('sha256').update(JSON.stringify(pricing)).digest('hex')
writeFileSync(
  resolve(root, 'src/lib/home/price-list.stamp.json'),
  `${JSON.stringify({ pricingSha256 }, null, 2)}\n`,
)
console.log('Wrote public/cenovnik-iris.pdf and src/lib/home/price-list.stamp.json')
