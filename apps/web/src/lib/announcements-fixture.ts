import type {
  Announcement,
  PlatformAnnouncement,
  PlatformAnnouncementInput,
  PlatformAnnouncementStatus,
} from '@/types/announcement'
import { MAX_ANNOUNCEMENT_MESSAGE_LENGTH } from '@/types/announcement'

// Fixture-mode twin of iris-api/internal/store/announcements.go: an in-memory
// list for the single fixture organization, validated like the API.

type AnnouncementApi = Pick<
  Window['api'],
  | 'getAnnouncements'
  | 'getPublicAnnouncements'
  | 'getPlatformAnnouncements'
  | 'createPlatformAnnouncement'
  | 'updatePlatformAnnouncement'
  | 'endPlatformAnnouncement'
  | 'deletePlatformAnnouncement'
>

const SEVERITY_ORDER = { maintenance: 0, warning: 1, info: 2 } as const

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function parseTime(value: string, label: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} nije ispravno vreme.`)
  return stamp(parsed)
}

export function announcementStatus(item: Announcement, now: string): PlatformAnnouncementStatus {
  if (item.startsAt > now) return 'scheduled'
  if (item.endsAt !== null && item.endsAt <= now) return 'ended'
  return 'active'
}

export function createAnnouncementFixtureStore(options: {
  platformSignedIn: () => boolean
  tenant: { slug: string; name: string }
  now?: () => Date
}): { api: AnnouncementApi } {
  const now = (): string => stamp(options.now?.() ?? new Date())
  let items: PlatformAnnouncement[] = []
  let sequence = 0

  const requirePlatform = (): void => {
    if (!options.platformSignedIn()) throw new Error('Prijava je obavezna.')
  }
  const withStatus = (item: PlatformAnnouncement): PlatformAnnouncement => ({
    ...item,
    status: announcementStatus(item, now()),
    tenants: item.tenants.map((tenant) => ({ ...tenant })),
  })
  const find = (id: string): PlatformAnnouncement => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) throw new Error('Obaveštenje ne postoji.')
    return item
  }
  const normalize = (input: PlatformAnnouncementInput, requireFutureEnd: boolean) => {
    const message = input.message.trim()
    if (!message) throw new Error('Tekst obaveštenja je obavezan.')
    if ([...message].length > MAX_ANNOUNCEMENT_MESSAGE_LENGTH) {
      throw new Error(`Tekst obaveštenja je predugačak (najviše ${MAX_ANNOUNCEMENT_MESSAGE_LENGTH} znakova).`)
    }
    if (!(input.severity in SEVERITY_ORDER)) throw new Error('Nepoznata vrsta obaveštenja.')
    const current = now()
    const startsAt = input.startsAt ? parseTime(input.startsAt, 'Početak') : current
    const endsAt = input.endsAt ? parseTime(input.endsAt, 'Kraj') : null
    if (endsAt !== null && endsAt <= startsAt) throw new Error('Kraj mora biti posle početka.')
    if (endsAt !== null && requireFutureEnd && endsAt <= current) throw new Error('Kraj mora biti u budućnosti.')
    let tenants: { slug: string; name: string }[] = []
    if (!input.allTenants) {
      const slugs = [...new Set(input.tenantSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))]
      for (const slug of slugs) {
        if (slug !== options.tenant.slug) throw new Error(`Organizacija „${slug}” ne postoji.`)
      }
      if (slugs.length === 0) throw new Error('Izaberite bar jednu organizaciju ili sve organizacije.')
      tenants = [{ ...options.tenant }]
    }
    return { message, severity: input.severity, startsAt, endsAt, allTenants: input.allTenants, tenants }
  }
  const active = (): Announcement[] => {
    const current = now()
    return items
      .filter((item) => announcementStatus(item, current) === 'active')
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.startsAt.localeCompare(a.startsAt),
      )
      .map(({ id, message, severity, startsAt, endsAt }) => ({ id, message, severity, startsAt, endsAt }))
  }

  return {
    api: {
      async getAnnouncements() {
        return active()
      },
      async getPublicAnnouncements(slug) {
        return slug.toLowerCase() === options.tenant.slug ? active() : []
      },
      async getPlatformAnnouncements() {
        requirePlatform()
        return [...items].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(withStatus)
      },
      async createPlatformAnnouncement(input) {
        requirePlatform()
        const current = now()
        sequence += 1
        const item: PlatformAnnouncement = {
          id: `ann-fixture-${sequence}`,
          ...normalize(input, true),
          status: 'active',
          createdAt: current,
          createdBy: 'operater',
          updatedAt: current,
        }
        items = [...items, item]
        return withStatus(item)
      },
      async updatePlatformAnnouncement(id, input) {
        requirePlatform()
        const next = { ...find(id), ...normalize(input, false), updatedAt: now() }
        items = items.map((item) => (item.id === id ? next : item))
        return withStatus(next)
      },
      async endPlatformAnnouncement(id) {
        requirePlatform()
        const item = find(id)
        const current = now()
        if (announcementStatus(item, current) === 'ended') return withStatus(item)
        const next = {
          ...item,
          startsAt: item.startsAt > current ? current : item.startsAt,
          endsAt: current,
          updatedAt: current,
        }
        items = items.map((candidate) => (candidate.id === id ? next : candidate))
        return withStatus(next)
      },
      async deletePlatformAnnouncement(id) {
        requirePlatform()
        find(id)
        items = items.filter((item) => item.id !== id)
      },
    },
  }
}
