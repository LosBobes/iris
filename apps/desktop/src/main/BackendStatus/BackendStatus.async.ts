import { ipcMain } from 'electron'
import { getConfiguredBackendStatus } from '../shared/iris-api-client'

export function registerBackendStatusHandlers(): void {
  ipcMain.handle('app:getBackendStatus', async () => {
    return getConfiguredBackendStatus()
  })
}