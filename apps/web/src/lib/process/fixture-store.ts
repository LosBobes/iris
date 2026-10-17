import { ApiError } from '@/lib/errors'
import {
  copyTemplateToOrder,
  hasStructuralChange,
  normalizeGraphForKinds,
  stripOrderState,
  validateGraph,
} from '@/lib/process/graph'
import type {
  ProcessGraph,
  ProcessNode,
  ProcessTemplate,
  ProcessTemplateInput,
  WorkOrderProcess,
  WorkOrderProcessInput,
} from '@/types/process'

// In-memory process store for fixture mode. It mirrors the API's validation and
// permission rules (see the process contract) closely enough for demos and UI
// development; the Go service stays authoritative.

const MESSAGES = {
  forbidden: 'Samo administrator može menjati strukturu procesa.',
  adminOnly: 'Potrebna je administratorska uloga.',
  duplicateName: 'Proces sa tim nazivom već postoji.',
  nameRequired: 'Naziv procesa je obavezan.',
  nameTooLong: 'Naziv procesa može imati najviše 120 znakova.',
  templateMissing: 'Proces nije pronađen.',
  orderMissing: 'Radni nalog nije pronađen.',
  orderHasProcess: 'Radni nalog već ima proces.',
  tenantMissing: 'Organizacija nije pronađena.',
  loginRequired: 'Prijava je obavezna.',
}

function fixtureError(status: number, message: string): ApiError {
  return new ApiError(message, { status, url: 'fixture://process', method: 'FIXTURE' })
}

function node(
  id: string,
  kind: ProcessNode['kind'],
  label: string,
  x: number,
  y: number,
  extra: Partial<ProcessNode> = {},
): ProcessNode {
  return { id, kind, label, x, y, ...extra }
}

function seedGraph(): ProcessGraph {
  const edge = (source: string, target: string): { id: string; source: string; target: string } => ({
    id: `e-${source}-${target}`,
    source,
    target,
  })
  return {
    nodes: [
      node('step-prep', 'step', 'Priprema', 0, 150),
      node('step-print', 'step', 'Štampa', 280, 150),
      node('step-cut', 'step', 'Sečenje', 560, 150),
      node('step-pack', 'step', 'Pakovanje', 840, 150),
      node('in-plates', 'input', 'Ploče', 0, 0, { quantity: 4, unit: 'kom' }),
      node('in-paper', 'input', 'Papir', 280, 0, { quantity: 1000, unit: 'tabaka' }),
      node('in-ink', 'input', 'Boja', 420, 0, { quantity: 2, unit: 'kg' }),
      node('out-waste-ink', 'byproduct', 'Makulatura', 280, 300, { quantity: 50, unit: 'tabaka' }),
      node('out-scrap', 'byproduct', 'Otpad papira', 560, 300, { quantity: 5, unit: 'kg' }),
      node('out-product', 'product', 'Gotovi otisci', 840, 300, { quantity: 950, unit: 'kom' }),
    ],
    edges: [
      edge('in-plates', 'step-prep'),
      edge('in-paper', 'step-print'),
      edge('in-ink', 'step-print'),
      edge('step-prep', 'step-print'),
      edge('step-print', 'step-cut'),
      edge('step-cut', 'step-pack'),
      edge('step-print', 'out-waste-ink'),
      edge('step-cut', 'out-scrap'),
      edge('step-pack', 'out-product'),
    ],
  }
}

interface ProcessFixtureContext {
  /** The signed-in organization user, or null. */
  currentUser: () => { username: string; role: 'admin' | 'user' } | null
  workOrderExists: (id: string) => boolean
  /** The single fixture organization's slug. */
  tenantSlug: string
  platformSignedIn: () => boolean
}

type ProcessApi = Pick<
  Window['api'],
  | 'getProcessTemplates'
  | 'getProcessTemplate'
  | 'createProcessTemplate'
  | 'updateProcessTemplate'
  | 'deleteProcessTemplate'
  | 'getWorkOrderProcess'
  | 'applyProcessTemplate'
  | 'updateWorkOrderProcess'
  | 'deleteWorkOrderProcess'
  | 'getPlatformProcessTemplates'
  | 'createPlatformProcessTemplate'
  | 'updatePlatformProcessTemplate'
  | 'deletePlatformProcessTemplate'
>

export interface ProcessFixtureStore {
  api: ProcessApi
  /** Called when a work order is created: attaches the default template, if any. */
  attachDefaultProcess: (workOrderId: string) => void
}

export function createProcessFixtureStore(context: ProcessFixtureContext): ProcessFixtureStore {
  const now = (): string => new Date().toISOString()
  const seededAt = now()
  let templates: ProcessTemplate[] = [
    {
      id: 'pt-offset',
      name: 'Offset štampa',
      description: 'Standardni proces offset štampe.',
      isDefault: true,
      graph: seedGraph(),
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ]
  const processes = new Map<string, WorkOrderProcess>()
  let sequence = 1

  const clone = <T>(value: T): T => structuredClone(value)

  const requireAdmin = (): { username: string } => {
    const user = context.currentUser()
    if (!user) throw fixtureError(401, MESSAGES.loginRequired)
    if (user.role !== 'admin') throw fixtureError(403, MESSAGES.adminOnly)
    return user
  }
  const requireUser = (): { username: string; role: 'admin' | 'user' } => {
    const user = context.currentUser()
    if (!user) throw fixtureError(401, MESSAGES.loginRequired)
    return user
  }
  const requirePlatform = (slug: string): void => {
    if (!context.platformSignedIn()) throw fixtureError(401, MESSAGES.loginRequired)
    if (slug !== context.tenantSlug) throw fixtureError(404, MESSAGES.tenantMissing)
  }

  const sorted = (): ProcessTemplate[] =>
    [...templates].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'sr'))

  const checkGraph = (graph: ProcessGraph): void => {
    const [first] = validateGraph(graph)
    if (first) throw fixtureError(422, first)
  }

  const saveTemplate = (input: ProcessTemplateInput, id?: string): ProcessTemplate => {
    const name = (input.name ?? '').trim()
    if (name === '') throw fixtureError(422, MESSAGES.nameRequired)
    if (name.length > 120) throw fixtureError(422, MESSAGES.nameTooLong)
    if (templates.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
      throw fixtureError(422, MESSAGES.duplicateName)
    }
    const graph = stripOrderState(normalizeGraphForKinds(input.graph))
    checkGraph(graph)

    const timestamp = now()
    const isDefault = input.isDefault === true
    if (isDefault) templates = templates.map((item) => ({ ...item, isDefault: false }))

    if (id) {
      const existing = templates.find((item) => item.id === id)
      if (!existing) throw fixtureError(404, MESSAGES.templateMissing)
      const updated: ProcessTemplate = {
        ...existing,
        name,
        description: input.description ?? '',
        isDefault,
        graph,
        updatedAt: timestamp,
      }
      templates = templates.map((item) => (item.id === id ? updated : item))
      return clone(updated)
    }
    sequence += 1
    const created: ProcessTemplate = {
      id: `pt-${sequence}`,
      name,
      description: input.description ?? '',
      isDefault,
      graph,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    templates = [...templates, created]
    return clone(created)
  }

  const removeTemplate = (id: string): void => {
    if (!templates.some((item) => item.id === id)) throw fixtureError(404, MESSAGES.templateMissing)
    templates = templates.filter((item) => item.id !== id)
    for (const [orderId, process] of processes) {
      if (process.templateId === id) processes.set(orderId, { ...process, templateId: null })
    }
  }

  const copyOntoOrder = (workOrderId: string, template: ProcessTemplate, username: string): WorkOrderProcess => {
    const created: WorkOrderProcess = {
      workOrderId,
      templateId: template.id,
      templateName: template.name,
      graph: copyTemplateToOrder(template.graph),
      updatedAt: now(),
      updatedBy: username,
    }
    processes.set(workOrderId, created)
    return created
  }

  return {
    attachDefaultProcess(workOrderId) {
      const template = templates.find((item) => item.isDefault)
      if (!template) return
      copyOntoOrder(workOrderId, template, context.currentUser()?.username ?? '')
    },

    api: {
      async getProcessTemplates() {
        requireUser()
        return clone(sorted())
      },
      async getProcessTemplate(id) {
        requireUser()
        const found = templates.find((item) => item.id === id)
        return found ? clone(found) : null
      },
      async createProcessTemplate(input) {
        requireAdmin()
        return saveTemplate(input)
      },
      async updateProcessTemplate(id, input) {
        requireAdmin()
        return saveTemplate(input, id)
      },
      async deleteProcessTemplate(id) {
        requireAdmin()
        removeTemplate(id)
      },

      async getWorkOrderProcess(workOrderId) {
        requireUser()
        const found = processes.get(workOrderId)
        return found && context.workOrderExists(workOrderId) ? clone(found) : null
      },
      async applyProcessTemplate(workOrderId, templateId) {
        const user = requireUser()
        if (!context.workOrderExists(workOrderId)) throw fixtureError(404, MESSAGES.orderMissing)
        const template = templates.find((item) => item.id === templateId)
        if (!template) throw fixtureError(404, MESSAGES.templateMissing)
        if (processes.has(workOrderId)) throw fixtureError(409, MESSAGES.orderHasProcess)
        return clone(copyOntoOrder(workOrderId, template, user.username))
      },
      async updateWorkOrderProcess(workOrderId, input: WorkOrderProcessInput) {
        const user = requireUser()
        const current = processes.get(workOrderId)
        if (!current) throw fixtureError(404, MESSAGES.orderMissing)
        const graph = normalizeGraphForKinds(input.graph)
        graph.nodes = graph.nodes.map((item) =>
          item.kind === 'step' ? { ...item, status: item.status ?? 'pending' } : item,
        )
        checkGraph(graph)
        if (user.role !== 'admin' && hasStructuralChange(current.graph, graph)) {
          throw fixtureError(403, MESSAGES.forbidden)
        }
        const updated: WorkOrderProcess = { ...current, graph, updatedAt: now(), updatedBy: user.username }
        processes.set(workOrderId, updated)
        return clone(updated)
      },
      async deleteWorkOrderProcess(workOrderId) {
        requireAdmin()
        if (!processes.delete(workOrderId)) throw fixtureError(404, MESSAGES.orderMissing)
      },

      async getPlatformProcessTemplates(slug) {
        requirePlatform(slug)
        return clone(sorted())
      },
      async createPlatformProcessTemplate(slug, input) {
        requirePlatform(slug)
        return saveTemplate(input)
      },
      async updatePlatformProcessTemplate(slug, id, input) {
        requirePlatform(slug)
        return saveTemplate(input, id)
      },
      async deletePlatformProcessTemplate(slug, id) {
        requirePlatform(slug)
        removeTemplate(id)
      },
    },
  }
}
