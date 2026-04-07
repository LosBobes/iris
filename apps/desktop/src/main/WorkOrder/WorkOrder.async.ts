import { ipcMain } from 'electron'
import type { WorkOrder } from '../../../model/work-order'
import { loadFixtureJson } from '../shared/load-fixture'

/**
 * Registers all IPC handlers for the WorkOrder feature.
 *
 * Channel: 'workorders:getAll'
 *   Returns:  WorkOrder[]
 *
 * Channel: 'workorders:getOperators'
 *   Returns:  string[]  (sorted unique operator usernames)
 *
 * Call this once from main/index.ts inside app.whenReady().
 */
export function registerWorkOrderHandlers(): void {
  let workOrders: WorkOrder[] | null = null

  function getOrders(): WorkOrder[] {
    if (workOrders === null) {
      workOrders = loadFixtureJson<WorkOrder[]>('work-orders.json')
    }
    return workOrders
  }

  ipcMain.handle('workorders:getAll', async (): Promise<WorkOrder[]> => {
    return getOrders()
  })

  ipcMain.handle('workorders:getOperators', async (): Promise<string[]> => {
    const operators = [...new Set(getOrders().map((o) => o.issuedBy))]
    return operators.sort()
  })
}
