import { describe, expect, it } from 'vitest'
import { sr } from '@/i18n/locales/sr'
import { en } from '@/i18n/locales/en'
import { FRESH_DAYS, forReader, todayISO, unseen, WHATS_NEW, type WhatsNewEntry } from './whats-new'

describe('WHATS_NEW', () => {
  it('has unique ids, newest first, with real dates', () => {
    const ids = WHATS_NEW.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const dates = WHATS_NEW.map((e) => e.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('has a title and a body in both languages, with no em dashes', () => {
    for (const { id } of WHATS_NEW) {
      for (const bundle of [sr, en]) {
        const words = bundle.whatsNew.entries[id]
        expect(words.title.length).toBeGreaterThan(0)
        expect(words.body.length).toBeGreaterThan(0)
        expect(`${words.title}${words.body}`).not.toContain('—')
      }
    }
  })
})

describe('forReader', () => {
  const entries: WhatsNewEntry[] = [
    { id: 'whatsNew', date: '2026-11-09' },
    { id: 'companyOrders', date: '2026-11-09', for: 'admins' },
    { id: 'packages', date: '2026-10-29', for: 'operators' },
  ]
  it("shows everyone's and the reader's own side, never the other side's", () => {
    expect(forReader(entries, true).map((e) => e.id)).toEqual(['whatsNew', 'companyOrders'])
    expect(forReader(entries, false).map((e) => e.id)).toEqual(['whatsNew', 'packages'])
  })
})

describe('unseen', () => {
  const entries: WhatsNewEntry[] = [
    { id: 'whatsNew', date: '2026-11-09' },
    { id: 'packages', date: '2026-10-01' },
  ]
  it('leaves out what was seen', () => {
    expect(unseen(entries, ['whatsNew'], '2026-11-09').map((e) => e.id)).toEqual(['packages'])
  })
  it(`hands a browser with no record only the last ${FRESH_DAYS} days`, () => {
    expect(unseen(entries, null, '2026-11-09').map((e) => e.id)).toEqual(['whatsNew'])
    expect(unseen(entries, null, '2026-10-20').map((e) => e.id)).toEqual(['whatsNew', 'packages'])
  })
})

describe('todayISO', () => {
  it('writes the local date', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('audiences of the real entries', () => {
  it("keeps the admins' dashboard finance news away from operators", () => {
    expect(forReader(WHATS_NEW, false).map((e) => e.id)).not.toContain('companyOrders')
    expect(forReader(WHATS_NEW, true).map((e) => e.id)).toContain('companyOrders')
  })
})
