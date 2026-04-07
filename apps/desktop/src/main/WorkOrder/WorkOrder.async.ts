import { ipcMain } from 'electron'
import type { WorkOrder, CreateWorkOrderInput, UpdateWorkOrderInput } from '../../../model/work-order'
import { loadFixtureJson } from '../shared/load-fixture'

export function registerWorkOrderHandlers(): void {
  let workOrders: WorkOrder[] = loadFixtureJson<WorkOrder[]>('work-orders.json')
  let sequenceCounter = workOrders.length + 1

  function generateOrderNumber(): string {
    const year = new Date().getFullYear()
    const num = String(sequenceCounter++).padStart(4, '0')
    return `RN-${year}-${num}`
  }

  ipcMain.handle('workorders:getAll', async (): Promise<WorkOrder[]> => {
    return workOrders
  })

  ipcMain.handle('workorders:getOperators', async (): Promise<string[]> => {
    const operators = [...new Set(workOrders.map((order) => order.issuedBy))]
    return operators.sort()
  })

  ipcMain.handle(
    'workorders:getById',
    async (_event, { id }: { id: string }): Promise<WorkOrder | null> => {
      return workOrders.find((order) => order.id === id) ?? null
    }
  )

  ipcMain.handle(
    'workorders:create',
    async (_event, input: CreateWorkOrderInput): Promise<WorkOrder> => {
      const now = new Date().toISOString()
      const newOrder: WorkOrder = {
        id: String(sequenceCounter),
        orderNumber: generateOrderNumber(),
        clientName: input.clientName,
        jobDescription: input.jobDescription,
        billingDocumentType: input.billingDocumentType,
        shipping: input.shipping,
        issuedBy: input.issuedBy,
        issueDate: input.issueDate,
        isCompleted: false,
        status: 'active',
        price: input.price,
        createdAt: now,
        updatedAt: now,
        completionDate: null,
      }
      workOrders.push(newOrder)
      return newOrder
    }
  )

  ipcMain.handle(
    'workorders:update',
    async (
      _event,
      { id, ...changes }: { id: string } & UpdateWorkOrderInput
    ): Promise<WorkOrder | null> => {
      const index = workOrders.findIndex((order) => order.id === id)
      if (index === -1) return null

      const updated: WorkOrder = {
        ...workOrders[index],
        ...changes,
        updatedAt: new Date().toISOString(),
      }
      workOrders[index] = updated
      return updated
    }
  )

  ipcMain.handle(
    'workorders:delete',
    async (_event, { id }: { id: string }): Promise<{ success: boolean }> => {
      const index = workOrders.findIndex((order) => order.id === id)
      if (index === -1) return { success: false }
      workOrders.splice(index, 1)
      return { success: true }
    }
  )
}
