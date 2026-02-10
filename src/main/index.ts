import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import type * as PtyModule from 'node-pty'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Workspace {
  path: string
  name: string
  addedAt: number
  lastOpened: number
}

interface AppStore {
  workspaces: Workspace[]
  lastWorkspace: string | null
  idePreference: string
  windowBounds: { x?: number; y?: number; width: number; height: number } | null
}

interface IDEDef {
  id: string
  name: string
  cmd: string
  icon: string
}

interface TermEntry {
  pty: PtyModule.IPty
  workspace: string
}

// ── State ──────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let pty: typeof PtyModule
const terminals = new Map<number, TermEntry>()
let nextTermId = 1
let store: AppStore

// ── Paths ──────────────────────────────────────────────────────────────────────

const storeFilePath = path.join(app.getPath('userData'), 'zeus-store.json')

// ── Store I/O ──────────────────────────────────────────────────────────────────

function loadStore(): AppStore {
  try {
    if (fs.existsSync(storeFilePath)) {
      return JSON.parse(fs.readFileSync(storeFilePath, 'utf-8'))
    }
  } catch {
    /* corrupted store — reset */
  }
  return { workspaces: [], lastWorkspace: null, idePreference: 'code', windowBounds: null }
}

function saveStore(data: AppStore): void {
  try {
    fs.mkdirSync(path.dirname(storeFilePath), { recursive: true })
    fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[zeus] Failed to save store:', e)
  }
}

// ── IDE Detection ──────────────────────────────────────────────────────────────

const IDE_LIST: IDEDef[] = [
  { id: 'code', name: 'VS Code', cmd: 'code', icon: 'vscode' },
  { id: 'cursor', name: 'Cursor', cmd: 'cursor', icon: 'cursor' },
  { id: 'antigravity', name: 'Anti-Gravities', cmd: 'antigravity', icon: 'antigravity' },
  { id: 'windsurf', name: 'Windsurf', cmd: 'windsurf', icon: 'windsurf' },
  { id: 'zed', name: 'Zed', cmd: 'zed', icon: 'zed' },
  { id: 'idea', name: 'IntelliJ IDEA', cmd: 'idea', icon: 'idea' },
  { id: 'webstorm', name: 'WebStorm', cmd: 'webstorm', icon: 'webstorm' },
  { id: 'sublime', name: 'Sublime Text', cmd: 'subl', icon: 'sublime' },
  { id: 'vim', name: 'Neovim', cmd: 'nvim', icon: 'vim' }
]

function whichSync(cmd: string): boolean {
  try {
    const whichCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    const result = execSync(whichCmd, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
    return result.length > 0
  } catch {
    return false
  }
}

function detectInstalledIDEs(): IDEDef[] {
  return IDE_LIST.filter((ide) => whichSync(ide.cmd))
}

// ── Claude Code ────────────────────────────────────────────────────────────────

function isClaudeCodeInstalled(): boolean {
  return whichSync('claude')
}

function getClaudeCodeVersion(): string | null {
  try {
    return execSync('claude --version', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch {
    return null
  }
}

function updateClaudeCode(): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      shell: true,
      env: { ...process.env }
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))

    child.on('close', (code) => {
      if (code === 0) resolve({ success: true, output: stdout })
      else resolve({ success: false, error: stderr || `Exit code ${code}` })
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

// ── Terminal (PTY) ─────────────────────────────────────────────────────────────

function getShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

function createTerminal(workspacePath?: string): { id: number; cwd: string } {
  const id = nextTermId++
  const cwd =
    workspacePath && fs.existsSync(workspacePath) ? workspacePath : os.homedir()

  const ptyProcess = pty.spawn(getShell(), [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
  })

  terminals.set(id, { pty: ptyProcess, workspace: cwd })

  ptyProcess.onData((data) => {
    mainWindow?.webContents.send('terminal:data', { id, data })
  })

  ptyProcess.onExit(({ exitCode }) => {
    terminals.delete(id)
    mainWindow?.webContents.send('terminal:exit', { id, exitCode })
  })

  return { id, cwd }
}

// ── Window ─────────────────────────────────────────────────────────────────────

function createWindow(): void {
  const bounds = store.windowBounds

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1400,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false
  })

  // Dev or production loading
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', () => {
    if (mainWindow) {
      store.windowBounds = mainWindow.getBounds()
      saveStore(store)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  buildMenu()
}

// ── Menu ───────────────────────────────────────────────────────────────────────

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('action:new-terminal')
        },
        {
          label: 'Run Claude Code',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => mainWindow?.webContents.send('action:run-claude')
        },
        { type: 'separator' },
        {
          label: 'Clear Terminal',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('action:clear-terminal')
        }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC ────────────────────────────────────────────────────────────────────────

function registerIPC(): void {
  // Workspace
  ipcMain.handle('workspace:list', () => store.workspaces)

  ipcMain.handle('workspace:add', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose Workspace Directory'
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const dirPath = result.filePaths[0]
    const name = path.basename(dirPath)

    if (!store.workspaces.find((w) => w.path === dirPath)) {
      store.workspaces.push({ path: dirPath, name, addedAt: Date.now(), lastOpened: Date.now() })
      saveStore(store)
    }
    return { path: dirPath, name }
  })

  ipcMain.handle('workspace:remove', (_, wsPath: string) => {
    store.workspaces = store.workspaces.filter((w) => w.path !== wsPath)
    saveStore(store)
    return true
  })

  ipcMain.handle('workspace:set-last', (_, wsPath: string) => {
    store.lastWorkspace = wsPath
    const ws = store.workspaces.find((w) => w.path === wsPath)
    if (ws) ws.lastOpened = Date.now()
    saveStore(store)
    return true
  })

  ipcMain.handle('workspace:get-last', () => store.lastWorkspace)

  // Terminal
  ipcMain.handle('terminal:create', (_, workspacePath?: string) => createTerminal(workspacePath))

  ipcMain.on('terminal:write', (_, { id, data }: { id: number; data: string }) => {
    terminals.get(id)?.pty.write(data)
  })

  ipcMain.on('terminal:resize', (_, { id, cols, rows }: { id: number; cols: number; rows: number }) => {
    terminals.get(id)?.pty.resize(cols, rows)
  })

  ipcMain.handle('terminal:kill', (_, id: number) => {
    const t = terminals.get(id)
    if (t) {
      t.pty.kill()
      terminals.delete(id)
    }
    return true
  })

  // Claude
  ipcMain.handle('claude:is-installed', () => isClaudeCodeInstalled())
  ipcMain.handle('claude:version', () => getClaudeCodeVersion())
  ipcMain.handle('claude:update', () => updateClaudeCode())

  // IDE
  ipcMain.handle('ide:list', () => detectInstalledIDEs())

  ipcMain.handle('ide:open', (_, { ideCmd, workspacePath }: { ideCmd: string; workspacePath: string }) => {
    try {
      const child = spawn(ideCmd, [workspacePath], { detached: true, stdio: 'ignore', shell: true })
      child.unref()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('ide:get-preference', () => store.idePreference)
  ipcMain.handle('ide:set-preference', (_, ideId: string) => {
    store.idePreference = ideId
    saveStore(store)
    return true
  })

  // System
  ipcMain.handle('system:open-external', (_, url: string) => shell.openExternal(url))
  ipcMain.handle('system:reveal-in-finder', (_, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('system:get-home', () => os.homedir())
  ipcMain.handle('system:path-exists', (_, p: string) => fs.existsSync(p))

  ipcMain.handle('system:get-dir-info', (_, dirPath: string) => {
    try {
      if (!fs.statSync(dirPath).isDirectory()) return null
      const hasGit = fs.existsSync(path.join(dirPath, '.git'))
      const hasPackageJson = fs.existsSync(path.join(dirPath, 'package.json'))
      let packageName: string | null = null
      if (hasPackageJson) {
        try {
          packageName = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf-8')).name
        } catch { /* ignore */ }
      }
      return { name: path.basename(dirPath), path: dirPath, hasGit, hasPackageJson, packageName }
    } catch {
      return null
    }
  })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

function killAllTerminals(): void {
  for (const [, t] of terminals) {
    try { t.pty.kill() } catch { /* ignore */ }
  }
  terminals.clear()
}

app.whenReady().then(() => {
  pty = require('node-pty')
  store = loadStore()
  registerIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', killAllTerminals)
