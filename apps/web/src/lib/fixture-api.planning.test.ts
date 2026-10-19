import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import {
  ATTENDANCE_DISABLED_MESSAGE,
  PLANNING_DISABLED_MESSAGE,
  PLANNING_REQUIRES_ATTENDANCE_MESSAGE,
  PLANNING_REQUIRES_PROCESSES_MESSAGE,
} from './modules'

const ORDER = '3'

async function rejection(promise: Promise<unknown>): Promise<{ status?: number; message: string }> {
  try {
    await promise
  } catch (cause) {
    return cause as { status?: number; message: string }
  }
  throw new Error('expected a rejection')
}

async function planningApi(on = true) {
  const api = createFixtureApi({ modules: { stock: true, processes: true, attendance: true, planning: on } })
  await api.login({ orgSlug: 'demo', username: 'admin', password: 'admin123' })
  return api
}

describe('fixture planning: module gate', () => {
  it('answers 403 with the exact message for every planning call while the module is off', async () => {
    const api = await planningApi(false)
    const calls: (() => Promise<unknown>)[] = [
      () => api.listMachineTypes(),
      () => api.createMachineType({ name: 'X' }),
      () => api.listMachines(),
      () => api.listQualifications(),
      () => api.getWorkingHours(),
      () => api.getPlanDay('2026-10-19'),
      () => api.generatePlan({ date: '2099-01-05', replan: false }),
      () => api.getMyQueue(),
      () => api.getPlanningForecast(),
    ]
    for (const run of calls) {
      const error = await rejection(run())
      expect(error.status).toBe(403)
      expect(error.message).toBe(PLANNING_DISABLED_MESSAGE)
    }
  })

  it('rejects planning without processes in the Backoffice with 422 and counts it as off', async () => {
    const api = createFixtureApi()
    await api.platformLogin({ username: 'operater', password: 'operater-demo' })
    const error = await rejection(
      api.setPlatformTenantModules('demo', { stock: true, processes: false, attendance: true, planning: true }),
    )
    expect(error.status).toBe(422)
    expect(error.message).toBe(PLANNING_REQUIRES_PROCESSES_MESSAGE)
    const noAttendance = await rejection(
      api.setPlatformTenantModules('demo', { stock: true, processes: true, attendance: false, planning: true }),
    )
    expect(noAttendance.status).toBe(422)
    expect(noAttendance.message).toBe(PLANNING_REQUIRES_ATTENDANCE_MESSAGE)
    const saved = await api.setPlatformTenantModules('demo', { stock: true, processes: true, attendance: true, planning: true })
    expect(saved.modules.planning).toBe(true)
    expect((await api.getSettings()).modules.planning).toBe(true)
  })
})

describe('fixture attendance: its own module', () => {
  it('answers 403 while attendance is off, even with planning prerequisites on', async () => {
    const api = createFixtureApi({ modules: { stock: true, processes: true } })
    await api.login({ orgSlug: 'demo', username: 'admin', password: 'admin123' })
    for (const run of [
      () => api.listAttendance('2026-10-19'),
      () => api.setAttendance('u1', { date: '2026-10-19', present: true }),
    ]) {
      const error = await rejection(run())
      expect(error.status).toBe(403)
      expect(error.message).toBe(ATTENDANCE_DISABLED_MESSAGE)
    }
  })

  it('works with attendance alone and keeps overrides admin-only', async () => {
    const api = createFixtureApi({ modules: { attendance: true } })
    await api.login({ orgSlug: 'demo', username: 'admin', password: 'admin123' })
    expect((await rejection(api.listMachineTypes())).message).toBe(PLANNING_DISABLED_MESSAGE)
    const [first] = await api.listAttendance('2026-10-19')
    const entry = await api.setAttendance(first.userId, { date: '2026-10-19', present: false })
    expect(entry).toMatchObject({ override: false, present: false })

    const operator = createFixtureApi({ modules: { attendance: true } })
    await operator.login({ orgSlug: 'demo', username: 'user', password: 'user123' })
    expect((await operator.listAttendance('2026-10-19')).length).toBeGreaterThan(0)
    expect((await rejection(operator.setAttendance(first.userId, { date: '2026-10-19', present: true }))).status).toBe(403)
  })
})

describe('fixture planning: resources', () => {
  it('seeds machine types and machines, and validates names and dependencies', async () => {
    const api = await planningApi()
    const types = await api.listMachineTypes()
    expect(types.length).toBeGreaterThan(0)
    const machines = await api.listMachines()
    expect(machines.length).toBeGreaterThan(0)

    const created = await api.createMachineType({ name: 'Laminiranje' })
    expect((await rejection(api.createMachineType({ name: 'laminiranje' }))).status).toBe(409)
    expect((await rejection(api.createMachineType({ name: '  ' }))).status).toBe(422)
    const machine = await api.createMachine({ machineTypeId: created.id, name: 'Laminator', inService: true })
    expect((await rejection(api.deleteMachineType(created.id))).status).toBe(409)
    await api.deleteMachine(machine.id)
    await api.deleteMachineType(created.id)
    expect((await api.listMachineTypes()).some((type) => type.id === created.id)).toBe(false)
  })

  it('keeps writes admin-only', async () => {
    const api = createFixtureApi({ modules: { stock: true, processes: true, attendance: true, planning: true } })
    await api.login({ orgSlug: 'demo', username: 'user', password: 'user123' })
    expect((await rejection(api.createMachineType({ name: 'X' }))).status).toBe(403)
    expect((await api.listMachineTypes()).length).toBeGreaterThan(0)
  })

  it('validates and stores working hours', async () => {
    const api = await planningApi()
    const hours = await api.getWorkingHours()
    expect(hours.timeZone).toBe('Europe/Belgrade')
    expect((await rejection(api.setWorkingHours({ ...hours, days: [{ weekday: 1, start: '15:00', end: '07:00', breaks: [] }] }))).status).toBe(422)
    const saved = await api.setWorkingHours({ ...hours, days: [{ weekday: 1, start: '08:00', end: '16:00', breaks: [] }] })
    expect(saved.days).toHaveLength(1)
  })
})

describe('fixture planning: plans', () => {
  it('generates a draft from an order process, publishes it and fills the queue', async () => {
    const api = await planningApi()
    await api.applyProcessTemplate(ORDER, 'pt-offset')
    const [adminUser] = await api.listQualifications()
    // Next Monday-ish: pick the first future working day via the generated plan date.
    const date = nextWorkingDay()

    const draft = await api.generatePlan({ date, replan: false })
    expect(draft.status).toBe('draft')
    expect(draft.assignments.length).toBeGreaterThan(0)
    expect(draft.assignments.every((block) => block.userIds.length > 0)).toBe(true)

    const day = await api.getPlanDay(date)
    expect(day.draft?.id).toBe(draft.id)
    expect(day.published).toBeNull()

    await api.setAttendance(adminUser.userId, { date, present: true })
    const published = await api.publishPlan({ date })
    expect(published.status).toBe('published')
    expect((await api.getPlanDay(date)).draft).toBeNull()

    const queue = await api.getMyQueue(date)
    expect(queue.publishedAt).not.toBeNull()
    expect(queue.items.every((item) => item.userIds.includes(adminUser.userId))).toBe(true)
  })

  it('reports forecasts and rejects invalid generate requests', async () => {
    const api = await planningApi()
    await api.applyProcessTemplate(ORDER, 'pt-offset')
    const forecast = await api.getPlanningForecast()
    expect(forecast.some((entry) => entry.workOrderId === ORDER)).toBe(true)

    expect((await rejection(api.generatePlan({ date: '2020-01-06', replan: false }))).status).toBe(422)
    expect((await rejection(api.generatePlan({ date: nextWorkingDay(), replan: true }))).status).toBe(422)
    expect((await rejection(api.publishPlan({ date: nextWorkingDay() }))).status).toBe(404)
  })

  it('flags conflicts in a hand-edited draft instead of rejecting it', async () => {
    const api = await planningApi()
    await api.applyProcessTemplate(ORDER, 'pt-offset')
    const date = nextWorkingDay()
    const draft = await api.generatePlan({ date, replan: false })
    const [first] = draft.assignments
    const clash = { ...first, id: 'dup', orderNumber: 'X' }
    const saved = await api.updatePlanDraft({ date, assignments: [...draft.assignments, clash] })
    expect(saved.issues.some((issue) => issue.code === 'conflict')).toBe(true)
    await api.deletePlanDraft(date)
    expect((await api.getPlanDay(date)).draft).toBeNull()
  })

  it('lists no draft to operators', async () => {
    const admin = await planningApi()
    await admin.applyProcessTemplate(ORDER, 'pt-offset')
    const date = nextWorkingDay()
    await admin.generatePlan({ date, replan: false })
    expect((await admin.getPlanDay(date)).draft).not.toBeNull()
  })
})

function nextWorkingDay(): string {
  const day = new Date(Date.now() + 3 * 86_400_000)
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}
