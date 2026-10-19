import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import { PROCESSES_DISABLED_MESSAGE, PROCESSES_REQUIRE_STOCK_MESSAGE, STOCK_DISABLED_MESSAGE } from './modules'
import { normalizeOrganizationModules } from '@/types/settings'
import type { ProcessGraph } from '@/types/process'

const OPEN_ORDER = '3'
const PAPER = 'cat-4'

async function rejection(promise: Promise<unknown>): Promise<{ status?: number; message: string }> {
  try {
    await promise
  } catch (cause) {
    return cause as { status?: number; message: string }
  }
  throw new Error('expected a rejection')
}

async function platformApi(modules?: { processes: boolean; stock: boolean; planning?: boolean; attendance?: boolean }) {
  const api = createFixtureApi()
  await api.platformLogin({ username: 'operater', password: 'operater-demo' })
  if (modules) await api.setPlatformTenantModules('demo', { planning: false, attendance: false, ...modules })
  return api
}

describe('fixture modules: defaults', () => {
  it('starts with both modules off and exposes them in settings and the tenant list', async () => {
    const api = createFixtureApi()
    expect((await api.getSettings()).modules).toEqual({ processes: false, stock: false, planning: false, attendance: false })
    await api.platformLogin({ username: 'operater', password: 'operater-demo' })
    expect((await api.getPlatformTenants())[0].modules).toEqual({ processes: false, stock: false, planning: false, attendance: false })
  })

  it('ignores modules in updateSettings', async () => {
    const api = createFixtureApi()
    await api.updateSettings({ firmName: 'X', modules: { processes: true, stock: true, planning: false, attendance: false } } as never)
    expect((await api.getSettings()).modules).toEqual({ processes: false, stock: false, planning: false, attendance: false })
  })

  it('treats processes without stock as processes off', () => {
    expect(normalizeOrganizationModules({ processes: true, stock: false, planning: false, attendance: false })).toEqual({ processes: false, stock: false, planning: false, attendance: false })
    expect(normalizeOrganizationModules(undefined)).toEqual({ processes: false, stock: false, planning: false, attendance: false })
    expect(normalizeOrganizationModules({ processes: true, stock: true, planning: false, attendance: false })).toEqual({ processes: true, stock: true, planning: false, attendance: false })
    // Attendance stands alone; planning without it counts as off.
    expect(normalizeOrganizationModules({ attendance: true })).toEqual({ processes: false, stock: false, planning: false, attendance: true })
    expect(normalizeOrganizationModules({ processes: true, stock: true, planning: true })).toEqual({ processes: true, stock: true, planning: false, attendance: false })
  })
})

describe('fixture modules: switching', () => {
  it('requires a Backoffice session and rejects processes without stock with 422', async () => {
    const anonymous = createFixtureApi()
    await anonymous.platformLogout()
    await expect(anonymous.setPlatformTenantModules('demo', { processes: false, stock: true, planning: false, attendance: false })).rejects.toThrow()

    const api = await platformApi()
    const error = await rejection(api.setPlatformTenantModules('demo', { processes: true, stock: false, planning: false, attendance: false }))
    expect(error.status).toBe(422)
    expect(error.message).toBe(PROCESSES_REQUIRE_STOCK_MESSAGE)

    const saved = await api.setPlatformTenantModules('demo', { processes: true, stock: true, planning: false, attendance: false })
    expect(saved.modules).toEqual({ processes: true, stock: true, planning: false, attendance: false })
    expect((await api.getSettings()).modules).toEqual({ processes: true, stock: true, planning: false, attendance: false })
  })
})

describe('fixture modules: enforcement', () => {
  it('answers 403 with the exact Serbian message for process calls while processes are off', async () => {
    const api = await platformApi({ processes: false, stock: true, planning: false, attendance: false })
    for (const call of [
      () => api.getProcessTemplates(),
      () => api.getWorkOrderProcess(OPEN_ORDER),
      () => api.applyProcessTemplate(OPEN_ORDER, 'pt-offset'),
      () => api.deleteWorkOrderProcess(OPEN_ORDER),
    ]) {
      const error = await rejection(call())
      expect(error.status).toBe(403)
      expect(error.message).toBe(PROCESSES_DISABLED_MESSAGE)
    }
    // Platform templates stay available so they can be prepared in advance.
    expect((await api.getPlatformProcessTemplates('demo')).length).toBeGreaterThan(0)
  })

  it('answers 403 with the exact Serbian message for stock calls while stock is off', async () => {
    const api = createFixtureApi()
    for (const call of [
      () => api.getStockLevels(),
      () => api.getStockMovements(),
      () => api.postStockReceipt({ lines: [{ catalogItemId: PAPER, quantity: 1 }] }),
      () => api.postStockCount({ lines: [{ catalogItemId: PAPER, countedQuantity: 1 }] }),
    ]) {
      const error = await rejection(call())
      expect(error.status).toBe(403)
      expect(error.message).toBe(STOCK_DISABLED_MESSAGE)
    }
  })

  it('does not auto-attach the default template while processes are off', async () => {
    const api = await platformApi({ processes: false, stock: true, planning: false, attendance: false })
    const [order] = (await api.getWorkOrders({ limit: 1 })).items
    const created = await api.createWorkOrder({ ...order, id: undefined, orderNumber: undefined, issuedBy: 'admin', jobDescription: 'Test', clientName: 'Klijent', issueDate: '2026-03-01' } as never)
    await api.platformLogin({ username: 'operater', password: 'operater-demo' })
    await api.setPlatformTenantModules('demo', { processes: true, stock: true, planning: false, attendance: false })
    expect(await api.getWorkOrderProcess(created.id)).toBeNull()
  })

  it('returns stockOnHand null while stock is off and the number when on', async () => {
    const api = await platformApi()
    expect((await api.getCatalogItemById(PAPER))?.stockOnHand).toBeNull()
    await api.setPlatformTenantModules('demo', { processes: false, stock: true, planning: false, attendance: false })
    expect((await api.getCatalogItemById(PAPER))?.stockOnHand).toBe(620)
  })
})

describe('fixture modules: stock tracking', () => {
  const doneStep = async (api: Awaited<ReturnType<typeof platformApi>>) => {
    const process = await api.getWorkOrderProcess(OPEN_ORDER)
    if (!process) throw new Error('no process')
    const graph: ProcessGraph = structuredClone(process.graph)
    graph.nodes = graph.nodes.map((node) => (node.id === 'step-print' ? { ...node, status: 'done' as const } : node))
    await api.updateWorkOrderProcess(OPEN_ORDER, { graph })
  }

  it('posts for a process created while stock is on', async () => {
    const api = await platformApi({ processes: true, stock: true, planning: false, attendance: false })
    // Created under (processes on, stock on) -> tracked and posts.
    await api.applyProcessTemplate(OPEN_ORDER, 'pt-offset')
    await doneStep(api)
    expect((await api.getStockLevels({ limit: 100 })).items.find((l) => l.catalogItemId === PAPER)?.onHand).toBe(520)
  })
})
