import { describe, expect, it } from 'vitest'
import { createAnnouncementFixtureStore } from './announcements-fixture'

function store(now = new Date('2026-10-18T12:00:00Z')) {
  let signedIn = true
  const clock = { now }
  const { api } = createAnnouncementFixtureStore({
    platformSignedIn: () => signedIn,
    tenant: { slug: 'demo', name: 'Demo' },
    now: () => clock.now,
  })
  return { api, clock, signOut: () => (signedIn = false) }
}

describe('announcement fixture store', () => {
  it('mirrors the API: validation, window, ordering, end and delete', async () => {
    const { api, clock, signOut } = store()
    await expect(api.createPlatformAnnouncement({ message: ' ', severity: 'info', allTenants: true, tenantSlugs: [] })).rejects.toThrow(
      'Tekst obaveštenja je obavezan.',
    )
    await expect(
      api.createPlatformAnnouncement({ message: 'x', severity: 'info', allTenants: false, tenantSlugs: ['nema'] }),
    ).rejects.toThrow('ne postoji')

    const info = await api.createPlatformAnnouncement({ message: 'Info', severity: 'info', allTenants: true, tenantSlugs: [] })
    const maintenance = await api.createPlatformAnnouncement({
      message: 'Održavanje',
      severity: 'maintenance',
      endsAt: '2026-10-18T14:00:00Z',
      allTenants: false,
      tenantSlugs: ['DEMO'],
    })
    expect(info.startsAt).toBe('2026-10-18T12:00:00Z')
    expect(maintenance.tenants).toEqual([{ slug: 'demo', name: 'Demo' }])

    expect((await api.getAnnouncements()).map((item) => item.id)).toEqual([maintenance.id, info.id])
    expect(await api.getPublicAnnouncements('other')).toEqual([])
    expect(Object.keys((await api.getAnnouncements())[0]!).sort()).toEqual(['endsAt', 'id', 'message', 'severity', 'startsAt'])

    clock.now = new Date('2026-10-18T15:00:00Z')
    expect((await api.getAnnouncements()).map((item) => item.id)).toEqual([info.id])

    const ended = await api.endPlatformAnnouncement(info.id)
    expect(ended.status).toBe('ended')
    expect(await api.getAnnouncements()).toEqual([])

    await api.deletePlatformAnnouncement(info.id)
    expect((await api.getPlatformAnnouncements()).map((item) => item.id)).toEqual([maintenance.id])

    signOut()
    await expect(api.getPlatformAnnouncements()).rejects.toThrow('Prijava je obavezna.')
  })
})
