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
  ipcMain.handle('workorders:getAll', async (): Promise<WorkOrder[]> => {
    return loadFixtureJson<WorkOrder[]>('work-orders.json')
  })

  ipcMain.handle('workorders:getOperators', async (): Promise<string[]> => {
    const workOrders = loadFixtureJson<WorkOrder[]>('work-orders.json')
    const operators = [...new Set(workOrders.map((o) => o.issuedBy))]
    return operators.sort()
  })
}
