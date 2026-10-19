import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { PLANNING_DISABLED_MESSAGE } from './modules'
import { createHttpApi } from './api-client'

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(init.status === 204 ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(async () => response(body, { status }))
  return { api: createHttpApi('http://api.test', fetchMock), fetchMock }
}

function call(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index]
  return { url: url as string, method: (init.method ?? 'GET') as string, body: init.body ? JSON.parse(init.body) : undefined }
}

describe('planning HTTP client: resources', () => {
  it('maps machine types and machines to their routes', async () => {
    const { api, fetchMock } = setup({ id: 'mt1', name: 'Offset' })
    await api.createMachineType({ name: 'Offset' })
    await api.updateMachineType('mt 1', { name: 'Offset 2' })
    await api.deleteMachineType('mt 1')
    expect(call(fetchMock, 0)).toMatchObject({ url: 'http://api.test/machine-types', method: 'POST', body: { name: 'Offset' } })
    expect(call(fetchMock, 1)).toMatchObject({ url: 'http://api.test/machine-types/mt%201', method: 'PUT' })
    expect(call(fetchMock, 2)).toMatchObject({ url: 'http://api.test/machine-types/mt%201', method: 'DELETE' })

    const machine = { machineTypeId: 'mt1', name: 'M1', inService: true }
    await api.createMachine(machine)
    await api.updateMachine('m1', machine)
    await api.deleteMachine('m1')
    expect(call(fetchMock, 3)).toMatchObject({ url: 'http://api.test/machines', method: 'POST', body: machine })
    expect(call(fetchMock, 4)).toMatchObject({ url: 'http://api.test/machines/m1', method: 'PUT' })
    expect(call(fetchMock, 5)).toMatchObject({ url: 'http://api.test/machines/m1', method: 'DELETE' })

    const downtime = { from: '2026-10-21T08:00', to: '2026-10-22T15:00', note: 'Servis' }
    await api.listMachineDowntimes('m 1')
    await api.createMachineDowntime('m1', downtime)
    await api.deleteMachineDowntime('m1', 'd 1')
    expect(call(fetchMock, 6)).toMatchObject({ url: 'http://api.test/machines/m%201/downtimes', method: 'GET' })
    expect(call(fetchMock, 7)).toMatchObject({ url: 'http://api.test/machines/m1/downtimes', method: 'POST', body: downtime })
    expect(call(fetchMock, 8)).toMatchObject({ url: 'http://api.test/machines/m1/downtimes/d%201', method: 'DELETE' })
  })

  it('tolerates null lists', async () => {
    const { api } = setup(null)
    expect(await api.listMachineTypes()).toEqual([])
    expect(await api.listMachines()).toEqual([])
    expect(await api.listQualifications()).toEqual([])
    expect(await api.listAttendance('2026-10-19')).toEqual([])
    expect(await api.getPlanningForecast()).toEqual([])
  })

  it('reads and writes qualifications, attendance and working hours', async () => {
    const { api, fetchMock } = setup({ userId: 'u1', username: 'ana', machineTypeIds: null })
    expect(await api.setQualifications('u/1', { machineTypeIds: ['mt1'] })).toEqual({
      userId: 'u1',
      username: 'ana',
      machineTypeIds: [],
    })
    expect(call(fetchMock, 0)).toMatchObject({
      url: 'http://api.test/planning/qualifications/u%2F1',
      method: 'PUT',
      body: { machineTypeIds: ['mt1'] },
    })
    await api.listAttendance('2026-10-19')
    expect(call(fetchMock, 1).url).toBe('http://api.test/attendance?date=2026-10-19')
    await api.setAttendance('u1', { date: '2026-10-19', present: null })
    expect(call(fetchMock, 2)).toMatchObject({
      url: 'http://api.test/attendance/u1',
      method: 'PUT',
      body: { date: '2026-10-19', present: null },
    })
    const hours = { timeZone: 'Europe/Belgrade', days: [{ weekday: 1, start: '07:00', end: '15:00', breaks: [] }], transferMinutes: 15 }
    const saved = await api.setWorkingHours(hours)
    expect(call(fetchMock, 3)).toMatchObject({ url: 'http://api.test/planning/working-hours', method: 'PUT', body: hours })
    // A server from before D-028 sends no inter-operation time or exceptions.
    expect(saved.transferMinutes).toBe(0)
    expect(saved.exceptions).toEqual([])
  })
})

describe('planning HTTP client: plans', () => {
  const plan = { id: 'p1', date: '2026-10-19', status: 'draft', assignments: null, issues: null, lateOrders: null }

  it('normalizes null collections in plans and plan days', async () => {
    const { api, fetchMock } = setup(plan, 201)
    const generated = await api.generatePlan({ date: '2026-10-19', replan: false })
    expect(generated.assignments).toEqual([])
    expect(generated.issues).toEqual([])
    expect(generated.lateOrders).toEqual([])
    expect(call(fetchMock)).toMatchObject({
      url: 'http://api.test/planning/plan/generate',
      method: 'POST',
      body: { date: '2026-10-19', replan: false },
    })

    const day = setup({ date: '2026-10-19', draft: plan, published: null, drift: { suggested: true, reasons: null } })
    const loaded = await day.api.getPlanDay('2026-10-19')
    expect(day.fetchMock.mock.calls[0][0]).toBe('http://api.test/planning/plan?date=2026-10-19')
    expect(loaded.draft?.assignments).toEqual([])
    expect(loaded.published).toBeNull()
    expect(loaded.drift).toEqual({ suggested: true, reasons: [] })
  })

  it('saves, discards and publishes drafts', async () => {
    const { api, fetchMock } = setup(plan)
    await api.updatePlanDraft({ date: '2026-10-19', assignments: [] })
    await api.deletePlanDraft('2026-10-19')
    await api.publishPlan({ date: '2026-10-19' })
    expect(call(fetchMock, 0)).toMatchObject({ url: 'http://api.test/planning/plan/draft', method: 'PUT' })
    expect(call(fetchMock, 1)).toMatchObject({ url: 'http://api.test/planning/plan/draft?date=2026-10-19', method: 'DELETE' })
    expect(call(fetchMock, 2)).toMatchObject({ url: 'http://api.test/planning/plan/publish', method: 'POST', body: { date: '2026-10-19' } })
  })

  it('requests the queue with an optional date and the forecast', async () => {
    const { api, fetchMock } = setup({ date: '2026-10-19', publishedAt: null, items: null })
    expect((await api.getMyQueue()).items).toEqual([])
    await api.getMyQueue('2026-10-20')
    await api.getPlanningForecast()
    expect(call(fetchMock, 0).url).toBe('http://api.test/planning/my-queue')
    expect(call(fetchMock, 1).url).toBe('http://api.test/planning/my-queue?date=2026-10-20')
    expect(call(fetchMock, 2).url).toBe('http://api.test/planning/forecast')
  })

  it('surfaces the module-disabled 403 as an ApiError', async () => {
    const { api } = setup({ error: PLANNING_DISABLED_MESSAGE }, 403)
    const error = await api.getMyQueue().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).message).toBe(PLANNING_DISABLED_MESSAGE)
  })
})

describe('organization modules: planning', () => {
  it('sends planning with the other modules', async () => {
    const { api, fetchMock } = setup({ slug: 'demo' })
    await api.setPlatformTenantModules('demo', { processes: true, stock: true, planning: true, attendance: true })
    expect(call(fetchMock).body).toEqual({ processes: true, stock: true, planning: true, attendance: true })
  })

  it('counts planning as off without processes when reading settings', async () => {
    const { api } = setup({ firmName: 'X', modules: { processes: false, stock: true, planning: true, attendance: true } })
    expect((await api.getSettings()).modules).toEqual({ processes: false, stock: true, planning: false, attendance: true })
  })
})
