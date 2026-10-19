import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { registerIpc, stopEvents } from './ipc'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'OpenCode UI',
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    // barra del titolo nascosta: il contenuto arriva in cima e i controlli
    // riduci/ingrandisci/chiudi restano nativi (overlay) in alto a destra.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#10141d',
      symbolColor: '#aeb6c6',
      height: 34,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => stopEvents())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
