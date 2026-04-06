"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  // Send login credentials to the main process for validation.
  // Returns a LoginResponse (see index.d.ts for the full type).
  login: (credentials) => electron.ipcRenderer.invoke("auth:login", credentials),
  // Fetch all work orders from the main process.
  getWorkOrders: () => electron.ipcRenderer.invoke("workorders:getAll"),
  // Fetch the sorted list of unique operator usernames.
  getWorkOrderOperators: () => electron.ipcRenderer.invoke("workorders:getOperators")
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
