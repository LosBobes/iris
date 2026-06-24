import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Feature-specific IPC handlers - one import per main-process feature folder
import { registerAppVersionHandlers } from './AppVersion/AppVersion.async'
import { registerBackendStatusHandlers } from './BackendStatus/BackendStatus.async'
import { registerLoginHandlers } from './Login/Login.async'
import { registerWorkOrderHandlers } from './WorkOrder/WorkOrder.async'
import { registerCatalogHandlers } from './Catalog/Catalog.async'
import { registerSettingsHandlers } from './Settings/Settings.async'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1430,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// TODO: check if there is a support for Serbian Latin locale in Electron and set it properly. This is needed for correct date formatting in the dashboard charts.
app.commandLine.appendSwitch('lang', 'sr-Latn')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers for each feature
  registerAppVersionHandlers()
  registerBackendStatusHandlers()
  registerLoginHandlers()
  registerWorkOrderHandlers()
  registerCatalogHandlers()
  registerSettingsHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
