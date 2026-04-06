"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const icon = path.join(__dirname, "../../resources/icon.png");
const MOCK_USERS = [
  { id: "1", username: "admin", password: "admin123", role: "admin" }
];
function registerLoginHandlers() {
  electron.ipcMain.handle(
    "auth:login",
    async (_event, credentials) => {
      const { username, password } = credentials;
      const match = MOCK_USERS.find(
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
const MOCK_WORK_ORDERS = [
  // October 2024
  {
    id: "1",
    clientName: "Firma Doo",
    documentType: "invoice",
    deliveryMethod: "email",
    issuedBy: "marko.petrovic",
    createdAt: "2024-10-03",
    completedAt: "2024-10-04",
    price: 12e3
  },
  {
    id: "2",
    clientName: "Kompanija AB",
    documentType: "contract",
    deliveryMethod: "courier",
    issuedBy: "ana.jovic",
    createdAt: "2024-10-08",
    completedAt: "2024-10-10",
    price: 35e3
  },
  {
    id: "3",
    clientName: "Studio XYZ",
    documentType: "receipt",
    deliveryMethod: "pickup",
    issuedBy: "stefan.nikolic",
    createdAt: "2024-10-15",
    completedAt: null,
    price: null
  },
  {
    id: "4",
    clientName: "Agencija Pro",
    documentType: "certificate",
    deliveryMethod: "email",
    issuedBy: "jelena.markovic",
    createdAt: "2024-10-21",
    completedAt: "2024-10-22",
    price: 8500
  },
  // November 2024
  {
    id: "5",
    clientName: "TehnoServis",
    documentType: "invoice",
    deliveryMethod: "fax",
    issuedBy: "marko.petrovic",
    createdAt: "2024-11-05",
    completedAt: "2024-11-06",
    price: 21e3
  },
  {
    id: "6",
    clientName: "Firma Doo",
    documentType: "contract",
    deliveryMethod: "email",
    issuedBy: "ana.jovic",
    createdAt: "2024-11-11",
    completedAt: "2024-11-14",
    price: 48e3
  },
  {
    id: "7",
    clientName: "EkoGrad",
    documentType: "receipt",
    deliveryMethod: "courier",
    issuedBy: "stefan.nikolic",
    createdAt: "2024-11-19",
    completedAt: null,
    price: 15e3
  },
  {
    id: "8",
    clientName: "MediaPlus",
    documentType: "invoice",
    deliveryMethod: "pickup",
    issuedBy: "jelena.markovic",
    createdAt: "2024-11-27",
    completedAt: "2024-11-28",
    price: 9800
  },
  // December 2024
  {
    id: "9",
    clientName: "InfraGroup",
    documentType: "contract",
    deliveryMethod: "email",
    issuedBy: "marko.petrovic",
    createdAt: "2024-12-02",
    completedAt: "2024-12-05",
    price: 72e3
  },
  {
    id: "10",
    clientName: "Kompanija AB",
    documentType: "certificate",
    deliveryMethod: "courier",
    issuedBy: "ana.jovic",
    createdAt: "2024-12-10",
    completedAt: "2024-12-11",
    price: 11e3
  },
  {
    id: "11",
    clientName: "SportCenter",
    documentType: "invoice",
    deliveryMethod: "fax",
    issuedBy: "stefan.nikolic",
    createdAt: "2024-12-17",
    completedAt: null,
    price: null
  },
  {
    id: "12",
    clientName: "Agencija Pro",
    documentType: "receipt",
    deliveryMethod: "email",
    issuedBy: "jelena.markovic",
    createdAt: "2024-12-23",
    completedAt: "2024-12-24",
    price: 6500
  },
  // January 2025
  {
    id: "13",
    clientName: "BioLab Doo",
    documentType: "invoice",
    deliveryMethod: "email",
    issuedBy: "marko.petrovic",
    createdAt: "2025-01-07",
    completedAt: "2025-01-08",
    price: 18500
  },
  {
    id: "14",
    clientName: "Firma Doo",
    documentType: "contract",
    deliveryMethod: "courier",
    issuedBy: "ana.jovic",
    createdAt: "2025-01-13",
    completedAt: "2025-01-15",
    price: 55e3
  },
  {
    id: "15",
    clientName: "TehnoServis",
    documentType: "certificate",
    deliveryMethod: "pickup",
    issuedBy: "stefan.nikolic",
    createdAt: "2025-01-20",
    completedAt: null,
    price: 7200
  },
  {
    id: "16",
    clientName: "MediaPlus",
    documentType: "invoice",
    deliveryMethod: "email",
    issuedBy: "jelena.markovic",
    createdAt: "2025-01-28",
    completedAt: "2025-01-29",
    price: 13e3
  },
  // February 2025
  {
    id: "17",
    clientName: "EkoGrad",
    documentType: "receipt",
    deliveryMethod: "fax",
    issuedBy: "marko.petrovic",
    createdAt: "2025-02-04",
    completedAt: "2025-02-05",
    price: null
  },
  {
    id: "18",
    clientName: "InfraGroup",
    documentType: "invoice",
    deliveryMethod: "email",
    issuedBy: "ana.jovic",
    createdAt: "2025-02-10",
    completedAt: "2025-02-12",
    price: 29e3
  },
  {
    id: "19",
    clientName: "Kompanija AB",
    documentType: "contract",
    deliveryMethod: "courier",
    issuedBy: "stefan.nikolic",
    createdAt: "2025-02-18",
    completedAt: null,
    price: 41e3
  },
  {
    id: "20",
    clientName: "SportCenter",
    documentType: "certificate",
    deliveryMethod: "pickup",
    issuedBy: "jelena.markovic",
    createdAt: "2025-02-24",
    completedAt: "2025-02-25",
    price: 5500
  },
  // March 2025
  {
    id: "21",
    clientName: "BioLab Doo",
    documentType: "invoice",
    deliveryMethod: "email",
    issuedBy: "marko.petrovic",
    createdAt: "2025-03-03",
    completedAt: "2025-03-04",
    price: 22e3
  },
  {
    id: "22",
    clientName: "Agencija Pro",
    documentType: "receipt",
    deliveryMethod: "fax",
    issuedBy: "ana.jovic",
    createdAt: "2025-03-10",
    completedAt: null,
    price: 3800
  },
  {
    id: "23",
    clientName: "Firma Doo",
    documentType: "contract",
    deliveryMethod: "email",
    issuedBy: "stefan.nikolic",
    createdAt: "2025-03-17",
    completedAt: "2025-03-19",
    price: 67e3
  },
  {
    id: "24",
    clientName: "Studio XYZ",
    documentType: "certificate",
    deliveryMethod: "courier",
    issuedBy: "jelena.markovic",
    createdAt: "2025-03-24",
    completedAt: "2025-03-25",
    price: 9200
  },
  {
    id: "25",
    clientName: "TehnoServis",
    documentType: "invoice",
    deliveryMethod: "pickup",
    issuedBy: "marko.petrovic",
    createdAt: "2025-03-31",
    completedAt: null,
    price: null
  }
];
function registerWorkOrderHandlers() {
  electron.ipcMain.handle("workorders:getAll", async () => {
    return MOCK_WORK_ORDERS;
  });
  electron.ipcMain.handle("workorders:getOperators", async () => {
    const operators = [...new Set(MOCK_WORK_ORDERS.map((o) => o.issuedBy))];
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
