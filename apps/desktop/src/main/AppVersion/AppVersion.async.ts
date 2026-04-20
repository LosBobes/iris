import { app, ipcMain } from 'electron'

export function registerAppVersionHandlers(): void {
  ipcMain.handle('app:getVersion', async (): Promise<string> => {
    return app.getVersion()
  })
}