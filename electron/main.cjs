/**
 * 云枢 CloudPivot Electron 主进程
 *
 * - 生产加载 dist/index.html；开发使用 VITE_DEV_SERVER_URL
 * - preload 通过 contextBridge 暴露 window.cloudpivot（文件读写 / 窗口控制 / 系统信息 / 主题）
 * - 安全基线：contextIsolation=true、nodeIntegration=false
 */
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, net } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/** 窗口不写入频繁内存交换导致的闪烁 */
const PRELOAD = path.join(__dirname, 'preload.cjs')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/* ------------------------------------------------------------------ */
/* IPC：窗口控制                                                        */
/* ------------------------------------------------------------------ */
ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.isMaximized() ? win.unmaximize() : win.maximize()
})
ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})
ipcMain.handle('window:hideToTray', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.hide()
})

/* ------------------------------------------------------------------ */
/* IPC：文件读写                                                        */
/* ------------------------------------------------------------------ */
ipcMain.handle('fs:saveFile', async (event, opts) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: opts?.defaultPath,
    filters: opts?.filters
  })
  if (canceled || !filePath) return null
  await fs.promises.writeFile(filePath, opts?.content ?? '', 'utf-8')
  return filePath
})

ipcMain.handle('fs:openFile', async (event, opts) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: opts?.filters
  })
  if (canceled || !filePaths?.[0]) return null
  const content = await fs.promises.readFile(filePaths[0], 'utf-8')
  return { path: filePaths[0], content }
})

ipcMain.handle('fs:pickDirectory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  })
  return canceled || !filePaths?.[0] ? null : filePaths[0]
})

ipcMain.handle('fs:readFileBuffer', async (_event, filePath) => {
  const data = await fs.promises.readFile(filePath)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
})

ipcMain.handle('fs:writeFileBuffer', async (_event, filePath, data) => {
  await fs.promises.writeFile(filePath, Buffer.from(data))
  return true
})

ipcMain.handle('fs:exists', async (_event, filePath) => {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
})

/* ------------------------------------------------------------------ */
/* IPC：系统信息 / 主题                                                  */
/* ------------------------------------------------------------------ */
ipcMain.handle('system:getInfo', () => ({
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  paths: {
    app: app.getAppPath(),
    userData: app.getPath('userData')
  }
}))

ipcMain.handle('theme:setNativeTheme', (_event, theme) => {
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
})

/* ------------------------------------------------------------------ */
/* IPC：邮件发送（主进程发起，规避 file:// 下的 CORS 限制）              */
/* ------------------------------------------------------------------ */
ipcMain.handle('email:send', async (_event, opts) => {
  const endpoint = 'https://api.emailjs.com/api/v1.0/email/send'
  const response = await net.fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: opts?.serviceId,
      template_id: opts?.templateId,
      user_id: opts?.publicKey,
      template_params: opts?.params ?? {}
    })
  })
  const text = await response.text()
  if (!response.ok) {
    let message = `邮件发送失败（HTTP ${response.status}）`
    try {
      const body = JSON.parse(text)
      if (body?.message) message = body.message
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(message)
  }
  return true
})

/* ------------------------------------------------------------------ */
/* 生命周期                                                             */
/* ------------------------------------------------------------------ */
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})