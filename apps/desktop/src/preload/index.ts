import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Typed API surface exposed to the renderer process.
// Add a new method here for each IPC channel a feature needs to call.
const api = {
  // Send login credentials to the main process for validation.
  // Returns a LoginResponse (see index.d.ts for the full type).
  login: (credentials: { username: string; password: string }) =>
    ipcRenderer.invoke('auth:login', credentials),

  // Fetch all work orders from the main process.
  getWorkOrders: () => ipcRenderer.invoke('workorders:getAll'),

  // Fetch the sorted list of unique operator usernames.
  getWorkOrderOperators: () => ipcRenderer.invoke('workorders:getOperators')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
