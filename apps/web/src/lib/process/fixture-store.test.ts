import { describe, expect, it } from 'vitest'
import { createProcessFixtureStore } from './fixture-store'
import type { ProcessTemplateInput } from '@/types/process'

function setup(role: 'admin' | 'user' = 'admin') {
  const orders = new Set(['1'])
  const store = createProcessFixtureStore({
    currentUser: () => ({ username: 'tester', role }),
    workOrderExists: (id) => orders.has(id),
    tenantSlug: 'demo',
    platformSignedIn: () => true,
  })
  return store
}

const input = (name: string, isDefault = false): ProcessTemplateInput => ({
  name,
  isDefault,
  graph: {
    nodes: [{ id: 's', kind: 'step', label: 'Korak', x: 0, y: 0, status: 'done' }],
    edges: [],
  },
})

describe('process fixture store', () => {
  it('seeds the Offset štampa default template', async () => {
    const [template] = await setup().api.getProcessTemplates()
    expect(template.name).toBe('Offset štampa')
    expect(template.isDefault).toBe(true)
    expect(template.graph.nodes.filter((node) => node.kind === 'step').map((node) => node.label)).toEqual([
      'Priprema',
      'Štampa',
      'Sečenje',
      'Pakovanje',
    ])
  })

  it('keeps one default, rejects duplicate names and strips state', async () => {
    const { api } = setup()
    const created = await api.createProcessTemplate(input('Digitalna', true))
    expect(created.graph.nodes[0].status).toBeUndefined()
    const list = await api.getProcessTemplates()
    expect(list.filter((item) => item.isDefault).map((item) => item.name)).toEqual(['Digitalna'])
    await expect(api.createProcessTemplate(input('digitalna'))).rejects.toThrow('Proces sa tim nazivom već postoji.')
  })

  it('rejects invalid graphs with 422', async () => {
    await expect(
      setup().api.createProcessTemplate({ name: 'X', graph: { nodes: [], edges: [] } }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('attaches the default template to new orders and enforces the 409 on apply', async () => {
    const store = setup()
    store.attachDefaultProcess('1')
    const process = await store.api.getWorkOrderProcess('1')
    expect(process?.templateName).toBe('Offset štampa')
    expect(process?.graph.nodes.filter((node) => node.kind === 'step').every((node) => node.status === 'pending')).toBe(true)
    await expect(store.api.applyProcessTemplate('1', 'pt-offset')).rejects.toMatchObject({ status: 409 })
    expect(await store.api.getWorkOrderProcess('2')).toBeNull()
  })

  it('lets operators change state but not structure', async () => {
    const store = setup('user')
    store.attachDefaultProcess('1')
    const process = (await store.api.getWorkOrderProcess('1'))!
    const stateOnly = {
      graph: {
        ...process.graph,
        nodes: process.graph.nodes.map((node) => (node.kind === 'step' ? { ...node, status: 'done' as const } : node)),
      },
    }
    await expect(store.api.updateWorkOrderProcess('1', stateOnly)).resolves.toBeTruthy()
    const structural = {
      graph: { ...process.graph, nodes: process.graph.nodes.map((node) => ({ ...node, label: 'Drugo' })) },
    }
    await expect(store.api.updateWorkOrderProcess('1', structural)).rejects.toMatchObject({ status: 403 })
    await expect(store.api.createProcessTemplate(input('Novi'))).rejects.toMatchObject({ status: 403 })
    await expect(store.api.deleteWorkOrderProcess('1')).rejects.toMatchObject({ status: 403 })
  })

  it('keeps order processes when their template is deleted', async () => {
    const store = setup()
    store.attachDefaultProcess('1')
    await store.api.deleteProcessTemplate('pt-offset')
    const process = await store.api.getWorkOrderProcess('1')
    expect(process?.templateId).toBeNull()
    expect(process?.templateName).toBe('Offset štampa')
  })
})
