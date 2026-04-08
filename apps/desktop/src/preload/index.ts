import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../../model/work-order";

// Typed API surface exposed to the renderer process.
// Add a new method here for each IPC channel a feature needs to call.
const api = {
  // Send login credentials to the main process for validation.
  // Returns a LoginResponse (see index.d.ts for the full type).
  login: (credentials: { username: string; password: string }) =>
    ipcRenderer.invoke("auth:login", credentials),

  // Fetch all work orders from the main process.
  getWorkOrders: () => ipcRenderer.invoke("workorders:getAll"),

  // Fetch the sorted list of unique operator usernames.
  getWorkOrderOperators: () => ipcRenderer.invoke("workorders:getOperators"),

  // Fetch a single work order by ID.
  getWorkOrderById: (id: string) =>
    ipcRenderer.invoke("workorders:getById", { id }),

  // Create a new work order.
  createWorkOrder: (input: CreateWorkOrderInput) =>
    ipcRenderer.invoke("workorders:create", input),

  // Update an existing work order.
  updateWorkOrder: (id: string, changes: UpdateWorkOrderInput) =>
    ipcRenderer.invoke("workorders:update", { ...changes, id }),

  // Delete a work order.
  deleteWorkOrder: (id: string) =>
    ipcRenderer.invoke("workorders:delete", { id }),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
