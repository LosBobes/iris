"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const node_fs = require("node:fs");
const node_path = require("node:path");
const icon = path.join(__dirname, "../../resources/icon.png");
function resolveFixturePath(fileName) {
  const candidates = [
    node_path.join(electron.app.getAppPath(), "fixtures", fileName),
    node_path.join(process.cwd(), "fixtures", fileName)
  ];
  const match = candidates.find((candidate) => node_fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Fixture file not found: ${fileName}`);
  }
  return match;
}
function loadFixtureJson(fileName) {
  const filePath = resolveFixturePath(fileName);
  return JSON.parse(node_fs.readFileSync(filePath, "utf-8"));
}
function registerLoginHandlers() {
  electron.ipcMain.handle(
    "auth:login",
    async (_event, credentials) => {
      const users = loadFixtureJson("users.json");
      const { username, password } = credentials;
      const match = users.find(
        (u) => u.username === username && u.password === password
      );
      if (!match) {
        return { success: false, error: "Neispravno korisničko ime ili lozinka." };
      }
      const user = { id: match.id, username: match.username, role: match.role };
      return { success: true, user };
    }
  );
}
function registerWorkOrderHandlers() {
  let workOrders = null;
  function getOrders() {
    if (workOrders === null) {
      workOrders = loadFixtureJson("work-orders.json");
    }
    return workOrders;
  }
  electron.ipcMain.handle("workorders:getAll", async () => {
    return getOrders();
  });
  electron.ipcMain.handle("workorders:getOperators", async () => {
    const operators = [...new Set(getOrders().map((o) => o.issuedBy))];
    return operators.sort();
  });
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.commandLine.appendSwitch("lang", "sr-Latn");
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  registerLoginHandlers();
  registerWorkOrderHandlers();
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
