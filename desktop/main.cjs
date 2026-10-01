/**
 * ★ AI 智能体工作站 · Electron 桌面壳（P3）
 * ★ 启动时自动拉起内置 Node 服务（ELECTRON_RUN_AS_NODE），窗口加载工作站界面
 * ★ 关闭窗口时自动结束服务进程
 */
const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PORT = 3410
const URL = `http://127.0.0.1:${PORT}`
let serverProc = null

async function isServerUp() {
  try {
    const r = await fetch(`${URL}/api/templates`)
    return r.ok
  } catch { return false }
}

async function ensureServer() {
  if (await isServerUp()) return
  // ★ 用 Electron 自带的 Node 运行 server.mjs（ELECTRON_RUN_AS_NODE=1）
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NO_OPEN: '1' },
    stdio: 'ignore',
    windowsHide: true,
  })
  // 等服务就绪
  for (let i = 0; i < 40; i++) {
    await new Promise((s) => setTimeout(s, 400))
    if (await isServerUp()) return
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'Open Agent Team',
    icon: path.join(ROOT, 'web', 'oat.png'),
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.loadURL(URL)
  // 外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
}

app.whenReady().then(async () => {
  await ensureServer()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (serverProc) { try { serverProc.kill() } catch {} }
  app.quit()
})
