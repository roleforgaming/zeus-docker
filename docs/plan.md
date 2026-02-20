 Plan: Zeus — Electron → Web Client-Server Refactor                                                                                                                     
                                      
 Context

 Zeus is an Electron app where the main process (src/main/*.ts) handles PTY + Claude session management, the preload (src/preload/index.ts) exposes window.zeus.* via
 contextBridge (and owns all xterm.js instances), and the renderer uses window.zeus.* throughout its stores.

 Goal: Replace Electron with a headless Express/Socket.io server serving a static Svelte build, packaged in Docker for TrueNAS self-hosting.

 Key strategy: Create a window.zeus browser shim (zeus.ts) that implements the exact same API as the preload using socket.io + fetch, so all 10 existing stores remain
 unchanged. xterm.js moves from preload into the renderer shim.

 Architecture:
 Browser (Svelte 5 + xterm.js + socket.io-client)
     ↕  WebSocket (socket.io)
 Node.js Server (Express + Socket.io + node-pty)
     ↕  PTY / exec / file system
 Shell / Claude CLI / Host FS

 ---
 Reference Files (read before executing tasks)

 ┌─────────────────────────────────────┬─────────────────────────────────────────────┐
 │             Source file             │                Used in task                 │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/store.ts                   │ Task 2                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/claude-cli.ts              │ Task 3                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/claude-config.ts           │ Task 4                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/skills.ts                  │ Task 5                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/files.ts                   │ Task 6                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/terminal.ts                │ Task 7                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/claude-session.ts          │ Task 8                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/main/subagent-watcher.ts        │ Task 9                                      │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/preload/index.ts                │ Task 11 (shim must mirror this API exactly) │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/renderer/src/App.svelte         │ Task 15                                     │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/renderer/src/main.ts            │ Task 14                                     │
 ├─────────────────────────────────────┼─────────────────────────────────────────────┤
 │ src/renderer/src/lib/types/index.ts │ Task 11 (ZeusAPI interface reference)       │
 └─────────────────────────────────────┴─────────────────────────────────────────────┘

 ---
 Task 1 — Create server/package.json

 1a. Create the directory server/ if it does not exist:
     mkdir -p /home/savvydev/projects/zeus/server

 1b. Create the file /home/savvydev/projects/zeus/server/package.json with this exact content:

 {
   "name": "zeus-server",
   "version": "1.0.0",
   "type": "module",
   "main": "index.js",
   "scripts": {
     "start": "node index.js"
   },
   "dependencies": {
     "express": "^4.19.2",
     "socket.io": "^4.7.5",
     "node-pty": "^1.0.0"
   }
 }

 NOTE: marked and dompurify are NOT needed server-side — they are only used by the Svelte renderer for markdown display.

 ---
 Task 2 — Create server/store.js

 Port of src/main/store.ts. Create /home/savvydev/projects/zeus/server/store.js.

 2a. Read src/main/store.ts to understand the current code.

 2b. Create the file server/store.js. Apply ALL of these changes from the source:
   - Remove the line: import { app } from 'electron'
   - Add the line: import os from 'node:os'
   - Replace: const storeFilePath = path.join(app.getPath('userData'), 'zeus-store.json')
     With:    const storeFilePath = path.join(os.homedir(), '.config', 'Zeus', 'userData', 'zeus-store.json')
   - Remove ALL TypeScript type annotations: export interface, : Type, as const, ReturnType<typeof setTimeout>, etc.
   - Remove ALL interface/type blocks (Workspace, SavedSession, AppStore, IDEDef)
   - In initStore default, add savedSessions to the default object (intentional addition for web mode):
     _store = { workspaces: [], lastWorkspace: null, idePreference: 'code', windowBounds: null, savedSessions: [] }
   - Keep ALL function logic (getStore, initStore, saveStore, flushStore) identical otherwise

 2c. The final file must match this exactly:

 import path from 'node:path'
 import fs from 'node:fs'
 import os from 'node:os'

 const storeFilePath = path.join(os.homedir(), '.config', 'Zeus', 'userData', 'zeus-store.json')

 let _store
 let _saveTimer = null
 let _savePending = false

 export function getStore() {
   return _store
 }

 export function initStore() {
   try {
     if (fs.existsSync(storeFilePath)) {
       _store = JSON.parse(fs.readFileSync(storeFilePath, 'utf-8'))
       return _store
     }
   } catch { /* corrupted — reset */ }
   _store = { workspaces: [], lastWorkspace: null, idePreference: 'code', windowBounds: null, savedSessions: [] }
   return _store
 }

 export function saveStore() {
   _savePending = true
   if (_saveTimer) return
   _saveTimer = setTimeout(() => {
     _saveTimer = null
     if (!_savePending) return
     _savePending = false
     try {
       fs.mkdirSync(path.dirname(storeFilePath), { recursive: true })
       fs.writeFileSync(storeFilePath, JSON.stringify(_store, null, 2), 'utf-8')
     } catch (e) { console.error('[zeus] Failed to save store:', e) }
   }, 500)
 }

 export function flushStore() {
   if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
   if (_savePending) {
     _savePending = false
     try {
       fs.mkdirSync(path.dirname(storeFilePath), { recursive: true })
       fs.writeFileSync(storeFilePath, JSON.stringify(_store, null, 2), 'utf-8')
     } catch (e) { console.error('[zeus] Failed to flush store:', e) }
   }
 }

 ---
 Task 3 — Create server/claude-cli.js

 Port of src/main/claude-cli.ts. Create /home/savvydev/projects/zeus/server/claude-cli.js.

 3a. Read src/main/claude-cli.ts to understand the current code.

 3b. Create the file server/claude-cli.js. Apply ALL of these changes:
   - Remove the line: import type { IDEDef } from './store.js' (TypeScript type-only import, unused at runtime)
   - Remove ALL TypeScript type annotations: : string, : boolean, interface ModelAliasInfo, : ModelAliasInfo[], : Record<string, string>, etc.
   - Remove the export keyword from: export interface ModelAliasInfo (delete the entire interface block)
   - Remove type casts like: as Record<string, string>, as const
   - Remove typed generics from spawn calls: (d: Buffer) → (d)
   - Keep ALL function logic IDENTICAL — claude-cli.ts has zero Electron imports

 3c. Verify these functions are all exported in the final file:
   - whichSync, detectInstalledIDEs, getClaudeCliPath, resetClaudeCliPath
   - isClaudeCodeInstalled, getClaudeCodeVersion, getClaudeModelAliases
   - getShellEnv, checkLatestClaudeVersion, updateClaudeCode
   - IDE_LIST (exported const array)

 ---
 Task 4 — Create server/claude-config.js

 Port of src/main/claude-config.ts. Create /home/savvydev/projects/zeus/server/claude-config.js.

 4a. Read src/main/claude-config.ts to understand the current code.

 4b. Create the file server/claude-config.js. Apply ALL of these changes:
   - Remove ALL TypeScript type annotations and interface blocks (McpHealthEntry, PluginEntry, MarketplaceEntry)
   - Remove type casts like: as const
   - Remove typed generics from spawn calls: (d: Buffer) → (d)
   - Import stays the same: import { getClaudeCliPath, getShellEnv } from './claude-cli.js' (already .js)
   - Keep ALL function logic IDENTICAL — claude-config.ts has zero Electron imports

 4c. Verify these functions are all exported in the final file:
   - readClaudeConfig, writeClaudeConfig, readProjectClaudeConfig, writeProjectClaudeConfig
   - installMCPPackage, checkMcpHealth, listPlugins, listMarketplaces, runPluginCmd

 ---
 Task 5 — Create server/skills.js

 Port of src/main/skills.ts. Create /home/savvydev/projects/zeus/server/skills.js.

 5a. Read src/main/skills.ts to understand the current code.

 5b. Create the file server/skills.js. Apply ALL of these changes:
   - Remove ALL TypeScript: export type SkillKind, export interface CustomSkillEntry, : string, : void, etc.
   - Remove typed params like: { dir: string; kind: SkillKind }[] → just use plain array of objects
   - Keep ALL function logic IDENTICAL — skills.ts has zero Electron imports

 5c. Verify these are exported: SKIP_DIRS, parseFrontmatter, scanCustomSkills.

 ---
 Task 6 — Create server/files.js

 Port of src/main/files.ts. Create /home/savvydev/projects/zeus/server/files.js.

 6a. Read src/main/files.ts to understand the current code.

 6b. Create the file server/files.js. Apply ALL of these changes:
   - Remove the line: import type { AppStore } from './store.js' (TypeScript type-only import)
   - Remove ALL TypeScript annotations and interface blocks (MdFileEntry, GitChangedFile, TranscriptMessage)
   - Remove as const casts
   - Import stays: import { SKIP_DIRS } from './skills.js'
   - Keep ALL function logic IDENTICAL — files.ts has zero Electron imports

 6c. Verify these functions are all exported:
   - listMarkdownFiles, isPathAllowed, readFileContent, writeFileContent
   - getGitDiff, getGitDiffFile, getGitChangedFiles, readClaudeTranscript

 ---
 Task 7 — Create server/terminal.js

 New file (NOT a direct port). Create /home/savvydev/projects/zeus/server/terminal.js.

 The original src/main/terminal.ts is tightly coupled to BrowserWindow (it stores per-terminal state and sends data via webContents.send). This replacement is a stateless factory — server/index.js manages per-socket state.

 NOTE: The default shell is intentionally changed from /bin/zsh (macOS Electron) to /bin/bash (Docker Linux target).

 7a. Create /home/savvydev/projects/zeus/server/terminal.js with this exact content:

 import os from 'node:os'
 import fs from 'node:fs'

 function getShell() {
   if (process.platform === 'win32') return 'powershell.exe'
   return process.env.SHELL || '/bin/bash'
 }

 /**
  * Spawn a new PTY process. Returns { cwd, ptyProcess }.
  * Caller is responsible for wiring ptyProcess.onData/onExit to the socket.
  */
 export function spawnTerminal(ptyModule, workspacePath) {
   const cwd = workspacePath && fs.existsSync(workspacePath) ? workspacePath : os.homedir()
   const shell = getShell()
   const shellArgs = process.platform === 'win32' ? [] : ['--login']

   const ptyProcess = ptyModule.spawn(shell, shellArgs, {
     name: 'xterm-256color',
     cols: 120,
     rows: 30,
     cwd,
     env: {
       ...process.env,
       TERM: 'xterm-256color',
       COLORTERM: 'truecolor',
       TERM_PROGRAM: 'Zeus',
       LANG: process.env.LANG || 'en_US.UTF-8'
     }
   })

   return { cwd, ptyProcess }
 }

 ---
 Task 8 — Create server/claude-session.js

 Port of src/main/claude-session.ts. Create /home/savvydev/projects/zeus/server/claude-session.js.

 8a. Read src/main/claude-session.ts to understand the current code.

 8b. Create the file server/claude-session.js. Apply ALL of these changes:

   STEP 1 — Remove Electron imports:
   - Remove: import type { BrowserWindow } from 'electron'
   - Remove: import type * as PtyModule from 'node-pty'

   STEP 2 — Remove Electron state:
   - Remove: let _getWindow: () => BrowserWindow | null = () => null

   STEP 3 — Simplify initClaudeSession:
   - BEFORE: export function initClaudeSession(ptyModule: typeof PtyModule, getWindow: () => BrowserWindow | null): void { _pty = ptyModule; _getWindow = getWindow }
   - AFTER:  export function initClaudeSession(ptyModule) { _pty = ptyModule }

   STEP 4 — Add emit parameter to spawnClaudeSession:
   - BEFORE: export function spawnClaudeSession(conversationId: string, prompt: string, cwd: string, model?: string, resumeSessionId?: string): boolean
   - AFTER:  export function spawnClaudeSession(conversationId, prompt, cwd, model, resumeSessionId, emit)

   STEP 5 — Replace EVERY _getWindow()?.webContents.send(channel, data) with emit(channel, data):
   - There are approximately 7 occurrences in spawnClaudeSession (in flushNonJson, onData JSON handler, onExit, and the try/catch error handler)
   - Search for: _getWindow()?.webContents.send(
   - Replace with: emit(

   STEP 6 — Remove ALL TypeScript type annotations:
   - Remove all interface blocks (ClaudeSessionEntry, DetectedPrompt)
   - Remove all : Type annotations, typed generics, type casts

   STEP 7 — Verify these functions are all exported:
   - initClaudeSession, spawnClaudeSession, detectPrompt
   - respondToSession, abortSession, deleteSession, getSession, killAllClaudeSessions

 ---
 Task 9 — Create server/subagent-watcher.js

 Port of src/main/subagent-watcher.ts. Create /home/savvydev/projects/zeus/server/subagent-watcher.js.

 9a. Read src/main/subagent-watcher.ts to understand the current code.

 9b. Create the file server/subagent-watcher.js. Apply ALL of these changes:

   STEP 1 — Remove Electron imports:
   - Remove: import type { BrowserWindow } from 'electron'

   STEP 2 — Remove Electron state:
   - Remove: let _getWindow: () => BrowserWindow | null = () => null

   STEP 3 — Delete initSubagentWatcher entirely:
   - Remove the entire function: export function initSubagentWatcher(getWindow: () => BrowserWindow | null): void { _getWindow = getWindow }

   STEP 4 — Add emit parameter to startSubagentWatch:
   - BEFORE: export function startSubagentWatch(conversationId, parentSessionId, workspacePath, targets): boolean
   - AFTER:  export function startSubagentWatch(conversationId, parentSessionId, workspacePath, targets, emit)

   STEP 5 — Store emit in the _state object:
   - In startSubagentWatch, add emit to the _state assignment:
     _state = {
       conversationId,
       parentSessionId,
       projectDir,
       targets,
       emit,          // ← ADD THIS
       filePositions: new Map(),
       sessionToAgent: new Map(),
       staleFiles: new Set(),
       intervalId: setInterval(poll, 2000)
     }

   STEP 6 — In poll(), replace the IPC send with emit:
   - BEFORE: _getWindow()?.webContents.send('claude-session:subagent-activity', { conversationId: s.conversationId, activities })
   - AFTER:  s.emit('claude-session:subagent-activity', { conversationId: s.conversationId, activities })

   STEP 7 — Remove ALL TypeScript type annotations:
   - Remove all interface blocks (SubagentWatchTarget, SubagentActivity, WatchState)
   - Remove all : Type annotations, typed generics, type casts

   STEP 8 — Verify these functions are all exported:
   - startSubagentWatch, updateSubagentTargets, stopSubagentWatch
   - NOTE: initSubagentWatcher is NOT exported (it was deleted in STEP 3)

 ---
 Task 10 — Create server/index.js

 Create /home/savvydev/projects/zeus/server/index.js. This is the main server entry point.

 10a. Create the file with the imports section:

 import express from 'express'
 import { createServer } from 'node:http'
 import { Server } from 'socket.io'
 import { fileURLToPath } from 'node:url'
 import { createRequire } from 'node:module'
 import path from 'node:path'
 import os from 'node:os'
 import fs from 'node:fs'
 import { execSync } from 'node:child_process'

 import { initStore, getStore, saveStore, flushStore } from './store.js'
 import { spawnTerminal } from './terminal.js'
 import { initClaudeSession, spawnClaudeSession, respondToSession, abortSession, deleteSession, killAllClaudeSessions } from './claude-session.js'
 import { startSubagentWatch, updateSubagentTargets, stopSubagentWatch } from './subagent-watcher.js'
 import { scanCustomSkills } from './skills.js'
 import { listMarkdownFiles, readFileContent, writeFileContent, getGitDiff, getGitDiffFile, getGitChangedFiles, readClaudeTranscript } from './files.js'
 import { readClaudeConfig, writeClaudeConfig, readProjectClaudeConfig, writeProjectClaudeConfig, installMCPPackage, checkMcpHealth, listPlugins, listMarketplaces, runPluginCmd } from './claude-config.js'
 import { isClaudeCodeInstalled, getClaudeCodeVersion, getClaudeModelAliases, checkLatestClaudeVersion, updateClaudeCode, detectInstalledIDEs } from './claude-cli.js'

 10b. Add the setup section (after imports):

 // Load native node-pty using CommonJS require (ESM compatibility)
 const require = createRequire(import.meta.url)
 const pty = require('node-pty')

 const __dirname = path.dirname(fileURLToPath(import.meta.url))
 const PORT = parseInt(process.env.PORT || '8080', 10)

 // Init
 initStore()
 initClaudeSession(pty)

 const app = express()
 const httpServer = createServer(app)
 const io = new Server(httpServer, {
   cors: {
     origin: process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : false
   }
 })

 app.use(express.json())
 app.use(express.static(path.join(__dirname, '../dist')))
 app.get('/healthz', (_req, res) => res.send('ok'))
 // SPA fallback — serve index.html for all non-API routes
 app.get('*', (_req, res) => {
   const indexPath = path.join(__dirname, '../dist/index.html')
   if (fs.existsSync(indexPath)) {
     res.sendFile(indexPath)
   } else {
     res.status(503).send('Frontend not built. Run: npm run build')
   }
 })

 let nextTermId = 1

 10c. Add the socket.io connection handler with Terminal events:

 io.on('connection', (socket) => {
   console.log(`[zeus] Client connected: ${socket.id}`)

   // Per-socket terminal state (terminals die with their socket)
   const socketTerminals = new Map()
   // Per-socket claude session tracking
   const socketSessions = new Set()

   // Socket-scoped emit helper for passing to session/watcher modules
   function emit(channel, data) {
     socket.emit(channel, data)
   }

   // ── Terminal ────────────────────────────────────────────────────────────────

   socket.on('terminal:create', ({ workspacePath } = {}, ack) => {
     const id = nextTermId++
     const { cwd, ptyProcess } = spawnTerminal(pty, workspacePath)
     socketTerminals.set(id, ptyProcess)

     ptyProcess.onData((data) => socket.emit('terminal:data', { id, data }))
     ptyProcess.onExit(({ exitCode }) => {
       socketTerminals.delete(id)
       socket.emit('terminal:exit', { id, exitCode })
     })

     if (typeof ack === 'function') ack({ id, cwd })
     else socket.emit('terminal:created', { id, cwd })
   })

   socket.on('terminal:input', ({ id, data } = {}) => {
     socketTerminals.get(id)?.write(data)
   })

   socket.on('terminal:resize', ({ id, cols, rows } = {}) => {
     socketTerminals.get(id)?.resize(cols, rows)
   })

   socket.on('terminal:kill', ({ id } = {}, ack) => {
     const p = socketTerminals.get(id)
     if (p) {
       try { p.kill() } catch { /* ignore */ }
       socketTerminals.delete(id)
     }
     if (typeof ack === 'function') ack(true)
   })

 10d. Add Claude Session socket events (inside the io.on('connection') handler, after Terminal):

   // ── Claude Session ──────────────────────────────────────────────────────────

   socket.on('claude-session:send', ({ id, prompt, cwd, model, resumeSessionId } = {}, ack) => {
     socketSessions.add(id)
     const result = spawnClaudeSession(id, prompt, cwd, model, resumeSessionId, emit)
     if (typeof ack === 'function') ack(result)
   })

   socket.on('claude-session:abort', ({ id } = {}, ack) => {
     if (typeof ack === 'function') ack(abortSession(id))
   })

   socket.on('claude-session:respond', ({ id, response } = {}, ack) => {
     if (typeof ack === 'function') ack(respondToSession(id, response))
   })

   socket.on('claude-session:close', ({ id } = {}, ack) => {
     abortSession(id)
     deleteSession(id)
     socketSessions.delete(id)
     if (typeof ack === 'function') ack(true)
   })

   socket.on('claude-session:list-saved', ({ workspacePath } = {}, ack) => {
     const sessions = (getStore().savedSessions || []).filter((s) => s.workspacePath === workspacePath)
     if (typeof ack === 'function') ack(sessions)
   })

   socket.on('claude-session:save', ({ session } = {}, ack) => {
     const store = getStore()
     if (!store.savedSessions) store.savedSessions = []
     store.savedSessions = store.savedSessions.filter((s) => s.sessionId !== session.sessionId)
     store.savedSessions.push({ ...session, lastUsed: Date.now() })
     saveStore()
     if (typeof ack === 'function') ack(true)
   })

   socket.on('claude-session:read-transcript', ({ sessionId, workspacePath } = {}, ack) => {
     if (typeof ack === 'function') ack(readClaudeTranscript(sessionId, workspacePath))
   })

   socket.on('claude-session:delete-saved', ({ sessionId } = {}, ack) => {
     const store = getStore()
     if (store.savedSessions) {
       store.savedSessions = store.savedSessions.filter((s) => s.sessionId !== sessionId)
       saveStore()
     }
     if (typeof ack === 'function') ack(true)
   })

   socket.on('claude-session:watch-subagents', ({ conversationId, parentSessionId, workspacePath, targets } = {}, ack) => {
     if (typeof ack === 'function') ack(startSubagentWatch(conversationId, parentSessionId, workspacePath, targets, emit))
   })

   socket.on('claude-session:update-subagent-targets', ({ targets } = {}, ack) => {
     updateSubagentTargets(targets)
     if (typeof ack === 'function') ack(true)
   })

   socket.on('claude-session:stop-subagent-watch', (_, ack) => {
     stopSubagentWatch()
     if (typeof ack === 'function') ack(true)
   })

 10e. Add Workspace socket events:

   // ── Workspace ───────────────────────────────────────────────────────────────

   socket.on('workspace:list', (_, ack) => {
     if (typeof ack === 'function') ack(getStore().workspaces || [])
   })

   socket.on('workspace:add', (_, ack) => {
     if (typeof ack === 'function') ack(null) // shim handles path prompt
   })

   socket.on('workspace:add-path', ({ wsPath } = {}, ack) => {
     if (!wsPath || !fs.existsSync(wsPath)) {
       if (typeof ack === 'function') ack(null)
       return
     }
     const store = getStore()
     const existing = store.workspaces.find((w) => w.path === wsPath)
     if (existing) { if (typeof ack === 'function') ack(existing); return }
     const ws = { path: wsPath, name: path.basename(wsPath), addedAt: Date.now(), lastOpened: Date.now() }
     store.workspaces = [...store.workspaces, ws]
     saveStore()
     if (typeof ack === 'function') ack(ws)
   })

   socket.on('workspace:remove', ({ wsPath } = {}, ack) => {
     const store = getStore()
     store.workspaces = store.workspaces.filter((w) => w.path !== wsPath)
     saveStore()
     if (typeof ack === 'function') ack(true)
   })

   socket.on('workspace:rename', ({ wsPath, newName } = {}, ack) => {
     const store = getStore()
     const ws = store.workspaces.find((w) => w.path === wsPath)
     if (ws) { ws.name = newName; saveStore() }
     if (typeof ack === 'function') ack(!!ws)
   })

   socket.on('workspace:set-last', ({ wsPath } = {}, ack) => {
     getStore().lastWorkspace = wsPath
     saveStore()
     if (typeof ack === 'function') ack(true)
   })

   socket.on('workspace:get-last', (_, ack) => {
     if (typeof ack === 'function') ack(getStore().lastWorkspace)
   })

   socket.on('workspace:reorder', ({ orderedPaths } = {}, ack) => {
     const store = getStore()
     store.workspaces = orderedPaths
       .map((p) => store.workspaces.find((w) => w.path === p))
       .filter(Boolean)
     saveStore()
     if (typeof ack === 'function') ack(true)
   })

 10f. Add Claude CLI, IDE, and System socket events:

   // ── Claude CLI ──────────────────────────────────────────────────────────────

   socket.on('claude:is-installed', (_, ack) => {
     if (typeof ack === 'function') ack(isClaudeCodeInstalled())
   })

   socket.on('claude:version', (_, ack) => {
     if (typeof ack === 'function') ack(getClaudeCodeVersion())
   })

   socket.on('claude:models', (_, ack) => {
     if (typeof ack === 'function') ack(getClaudeModelAliases())
   })

   socket.on('claude:check-latest', async (_, ack) => {
     if (typeof ack === 'function') ack(await checkLatestClaudeVersion())
   })

   socket.on('claude:update', async (_, ack) => {
     if (typeof ack === 'function') ack(await updateClaudeCode())
   })

   // ── IDE ─────────────────────────────────────────────────────────────────────

   socket.on('ide:list', (_, ack) => {
     if (typeof ack === 'function') ack(detectInstalledIDEs())
   })

   socket.on('ide:open', ({ ideCmd, workspacePath } = {}, ack) => {
     try {
       execSync(`${ideCmd} "${workspacePath}"`, { shell: true, timeout: 5000 })
       if (typeof ack === 'function') ack({ success: true })
     } catch (e) {
       if (typeof ack === 'function') ack({ success: false, error: e.message })
     }
   })

   socket.on('ide:get-preference', (_, ack) => {
     if (typeof ack === 'function') ack(getStore().idePreference || 'code')
   })

   socket.on('ide:set-preference', ({ ideId } = {}, ack) => {
     getStore().idePreference = ideId
     saveStore()
     if (typeof ack === 'function') ack(true)
   })

   // ── System ──────────────────────────────────────────────────────────────────

   socket.on('system:open-external', ({ url } = {}, ack) => {
     // Browser shim handles window.open(); server-side is no-op
     if (typeof ack === 'function') ack()
   })

   socket.on('system:reveal-in-finder', (_, ack) => {
     // Not applicable in web context
     if (typeof ack === 'function') ack()
   })

   socket.on('system:get-home', (_, ack) => {
     if (typeof ack === 'function') ack(os.homedir())
   })

   socket.on('system:path-exists', ({ p } = {}, ack) => {
     if (typeof ack === 'function') ack(fs.existsSync(p))
   })

   socket.on('system:get-dir-info', ({ dirPath } = {}, ack) => {
     try {
       if (!fs.existsSync(dirPath)) { if (typeof ack === 'function') ack(null); return }
       const hasGit = fs.existsSync(path.join(dirPath, '.git'))
       const pkgPath = path.join(dirPath, 'package.json')
       const hasPackageJson = fs.existsSync(pkgPath)
       let packageName = null
       if (hasPackageJson) {
         try { packageName = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name } catch { /* ignore */ }
       }
       if (typeof ack === 'function') ack({ name: path.basename(dirPath), path: dirPath, hasGit, hasPackageJson, packageName })
     } catch {
       if (typeof ack === 'function') ack(null)
     }
   })

 10g. Add Claude Config, Skills, MCP, Plugin, Files, and Git socket events:

   // ── Claude Config ───────────────────────────────────────────────────────────

   socket.on('claude-config:read', (_, ack) => {
     if (typeof ack === 'function') ack(readClaudeConfig())
   })

   socket.on('claude-config:write', ({ config } = {}, ack) => {
     if (typeof ack === 'function') ack(writeClaudeConfig(config))
   })

   socket.on('claude-config:read-project', ({ wsPath } = {}, ack) => {
     if (typeof ack === 'function') ack(readProjectClaudeConfig(wsPath))
   })

   socket.on('claude-config:write-project', ({ wsPath, config } = {}, ack) => {
     if (typeof ack === 'function') ack(writeProjectClaudeConfig(wsPath, config))
   })

   // ── Skills ──────────────────────────────────────────────────────────────────

   socket.on('skills:scan', ({ wsPath } = {}, ack) => {
     if (typeof ack === 'function') ack(scanCustomSkills(wsPath))
   })

   // ── MCP ─────────────────────────────────────────────────────────────────────

   socket.on('mcp:install', async ({ pkg } = {}, ack) => {
     if (typeof ack === 'function') ack(await installMCPPackage(pkg))
   })

   socket.on('mcp:health', async (_, ack) => {
     if (typeof ack === 'function') ack(await checkMcpHealth())
   })

   // ── Plugins ─────────────────────────────────────────────────────────────────

   socket.on('plugin:list', async (_, ack) => {
     if (typeof ack === 'function') ack(await listPlugins())
   })

   socket.on('plugin:marketplace-list', async (_, ack) => {
     if (typeof ack === 'function') ack(await listMarketplaces())
   })

   socket.on('plugin:install', async ({ name, scope } = {}, ack) => {
     if (typeof ack === 'function') ack(await runPluginCmd('install', name, scope))
   })

   socket.on('plugin:uninstall', async ({ name } = {}, ack) => {
     if (typeof ack === 'function') ack(await runPluginCmd('uninstall', name))
   })

   socket.on('plugin:enable', async ({ name, scope } = {}, ack) => {
     if (typeof ack === 'function') ack(await runPluginCmd('enable', name, scope))
   })

   socket.on('plugin:disable', async ({ name, scope } = {}, ack) => {
     if (typeof ack === 'function') ack(await runPluginCmd('disable', name, scope))
   })

   socket.on('plugin:marketplace-add', async ({ source } = {}, ack) => {
     if (typeof ack === 'function') ack(await runPluginCmd('marketplace add', source))
   })

   // ── Files ───────────────────────────────────────────────────────────────────

   socket.on('files:list-md', ({ dirPath } = {}, ack) => {
     if (typeof ack === 'function') ack(listMarkdownFiles(dirPath))
   })

   socket.on('files:read', ({ filePath } = {}, ack) => {
     if (typeof ack === 'function') ack(readFileContent(filePath, getStore()))
   })

   socket.on('files:write', ({ filePath, content } = {}, ack) => {
     if (typeof ack === 'function') ack(writeFileContent(filePath, content, getStore()))
   })

   // ── Git ─────────────────────────────────────────────────────────────────────

   socket.on('git:diff', ({ workspacePath } = {}, ack) => {
     if (typeof ack === 'function') ack(getGitDiff(workspacePath))
   })

   socket.on('git:diff-file', ({ workspacePath, filePath } = {}, ack) => {
     if (typeof ack === 'function') ack(getGitDiffFile(workspacePath, filePath))
   })

   socket.on('git:changed-files', ({ workspacePath } = {}, ack) => {
     if (typeof ack === 'function') ack(getGitChangedFiles(workspacePath))
   })

 10h. Add disconnect handler and close the io.on('connection') block:

   // ── Cleanup on disconnect ───────────────────────────────────────────────────

   socket.on('disconnect', () => {
     console.log(`[zeus] Client disconnected: ${socket.id}`)
     for (const [id, p] of socketTerminals) {
       try { p.kill() } catch { /* ignore */ }
       socketTerminals.delete(id)
     }
     for (const convId of socketSessions) {
       abortSession(convId)
       deleteSession(convId)
     }
     socketSessions.clear()
     stopSubagentWatch()
   })
 })

 10i. Add the server listen and shutdown handlers (AFTER the io.on block):

 httpServer.listen(PORT, '0.0.0.0', () => {
   console.log(`[zeus] Server running at http://0.0.0.0:${PORT}`)
 })

 process.on('SIGTERM', () => {
   console.log('[zeus] Shutting down...')
   killAllClaudeSessions()
   flushStore()
   httpServer.close(() => process.exit(0))
 })

 process.on('SIGINT', () => {
   console.log('[zeus] Interrupted, shutting down...')
   killAllClaudeSessions()
   flushStore()
   httpServer.close(() => process.exit(0))
 })

 ---
 Task 11 — Create src/renderer/src/lib/zeus.ts

 Create /home/savvydev/projects/zeus/src/renderer/src/lib/zeus.ts.

 This is the browser shim — implements the exact ZeusAPI interface from src/renderer/src/lib/types/index.ts using socket.io-client + local xterm instances.

 The existing preload (src/preload/index.ts) is the reference: replicate all methods with same signatures. Each ipcRenderer.invoke(channel, ...args) becomes a
 socketEmit(channel, {args}) promise. Each ipcRenderer.send becomes socket.emit. Each ipcRenderer.on listener becomes socket.on.

 11a. Read src/preload/index.ts and src/renderer/src/lib/types/index.ts to understand the API.

 11b. Create the file with imports and socket setup:

 import { io } from 'socket.io-client'
 import { Terminal } from '@xterm/xterm'
 import { FitAddon } from '@xterm/addon-fit'
 import { WebglAddon } from '@xterm/addon-webgl'
 import { WebLinksAddon } from '@xterm/addon-web-links'

 // Connect to same origin (works behind Cloudflare Tunnel / reverse proxy)
 const socket = io(window.location.origin, { path: '/socket.io' })

 11c. Add local terminal state and theme:

 // ── Local xterm instances (live in renderer, mirrors preload behavior) ─────────

 interface LocalTerminal {
   xterm: Terminal
   fitAddon: FitAddon
   addons: { dispose(): void }[]
 }
 const localTerminals = new Map<number, LocalTerminal>()

 // ── Terminal Theme — Catppuccin Mocha (copied verbatim from src/preload/index.ts) ─
 const THEME = {
   background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
   cursorAccent: '#1e1e2e', selectionBackground: 'rgba(203, 166, 247, 0.28)',
   selectionForeground: '#cdd6f4',
   black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
   blue: '#89b4fa', magenta: '#cba6f7', cyan: '#94e2d5', white: '#bac2de',
   brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
   brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#cba6f7',
   brightCyan: '#94e2d5', brightWhite: '#a6adc8'
 } as const

 11d. Add the socket helper:

 // ── Socket helper: emit with callback → Promise ────────────────────────────────
 function socketEmit<T>(event: string, data: unknown): Promise<T> {
   return new Promise((resolve) => socket.emit(event, data, resolve))
 }

 11e. Add the zeus API object — terminal section:

 // ── Zeus API (matches ZeusAPI in src/renderer/src/lib/types/index.ts) ──────────

 const zeus = {
   terminal: {
     create: (workspacePath?: string) =>
       socketEmit<{ id: number; cwd: string }>('terminal:create', { workspacePath }),

     attach: (termId: number, elementId: string) => {
       const container = document.getElementById(elementId)
       if (!container) throw new Error(`Element #${elementId} not found`)

       const xterm = new Terminal({
         fontSize: 14,
         fontFamily: "'D2Coding ligature', D2Coding, 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
         lineHeight: 1.35,
         theme: THEME,
         cursorBlink: true,
         cursorStyle: 'bar',
         cursorInactiveStyle: 'outline',
         allowTransparency: true,
         scrollback: 5000,
         tabStopWidth: 4,
         macOptionIsMeta: true,
         macOptionClickForcesSelection: true,
         drawBoldTextInBrightColors: true,
         minimumContrastRatio: 1
       })

       const addons: { dispose(): void }[] = []
       const fitAddon = new FitAddon()
       xterm.loadAddon(fitAddon)
       addons.push(fitAddon)

       try {
         const wl = new WebLinksAddon((_: MouseEvent, uri: string) => window.open(uri, '_blank'))
         xterm.loadAddon(wl)
         addons.push(wl)
       } catch { /* ignore */ }

       xterm.open(container)

       try {
         const webgl = new WebglAddon()
         webgl.onContextLoss(() => webgl.dispose())
         xterm.loadAddon(webgl)
         addons.push(webgl)
       } catch { /* canvas fallback */ }

       fitAddon.fit()

       xterm.onData((data) => socket.emit('terminal:input', { id: termId, data }))
       xterm.onResize(({ cols, rows }) => socket.emit('terminal:resize', { id: termId, cols, rows }))

       localTerminals.set(termId, { xterm, fitAddon, addons })
       socket.emit('terminal:resize', { id: termId, cols: xterm.cols, rows: xterm.rows })

       return { cols: xterm.cols, rows: xterm.rows }
     },

     writeToPty: (termId: number, data: string) =>
       socket.emit('terminal:input', { id: termId, data }),

     focus: (termId: number) => localTerminals.get(termId)?.xterm.focus(),

     fit: (termId: number) => {
       const t = localTerminals.get(termId)
       if (!t) return null
       t.fitAddon.fit()
       return { cols: t.xterm.cols, rows: t.xterm.rows }
     },

     clear: (termId: number) => localTerminals.get(termId)?.xterm.clear(),

     getSize: (termId: number) => {
       const t = localTerminals.get(termId)
       return t ? { cols: t.xterm.cols, rows: t.xterm.rows } : null
     },

     kill: (termId: number): Promise<boolean> => {
       const local = localTerminals.get(termId)
       if (local) {
         for (const addon of local.addons) { try { addon.dispose() } catch { /* ignore */ } }
         local.addons.length = 0
         try { local.xterm.dispose() } catch { /* ignore */ }
         localTerminals.delete(termId)
       }
       return socketEmit<boolean>('terminal:kill', { id: termId })
     },

     onData: (callback: (payload: { id: number; data: string }) => void) => {
       const handler = (payload: { id: number; data: string }) => {
         const local = localTerminals.get(payload.id)
         if (local) local.xterm.write(payload.data)
         callback(payload)
       }
       socket.on('terminal:data', handler)
       return () => socket.off('terminal:data', handler)
     },

     onExit: (callback: (payload: { id: number; exitCode: number }) => void) => {
       const handler = (payload: { id: number; exitCode: number }) => {
         const local = localTerminals.get(payload.id)
         if (local) local.xterm.writeln(`\r\n\x1B[90m[Process exited with code ${payload.exitCode}]\x1B[0m`)
         callback(payload)
       }
       socket.on('terminal:exit', handler)
       return () => socket.off('terminal:exit', handler)
     }
   },

 11f. Add the zeus API object — claudeSession section:

   claudeSession: {
     send: (conversationId: string, prompt: string, cwd: string, model?: string, resumeSessionId?: string) =>
       socketEmit<boolean>('claude-session:send', { id: conversationId, prompt, cwd, model, resumeSessionId }),
     abort: (conversationId: string) =>
       socketEmit<boolean>('claude-session:abort', { id: conversationId }),
     respond: (conversationId: string, response: string) =>
       socketEmit<boolean>('claude-session:respond', { id: conversationId, response }),
     close: (conversationId: string) =>
       socketEmit<boolean>('claude-session:close', { id: conversationId }),
     listSaved: (workspacePath: string) =>
       socketEmit<unknown[]>('claude-session:list-saved', { workspacePath }),
     save: (session: { sessionId: string; title: string; workspacePath: string }) =>
       socketEmit<boolean>('claude-session:save', { session }),
     readTranscript: (sessionId: string, workspacePath: string) =>
       socketEmit<unknown[]>('claude-session:read-transcript', { sessionId, workspacePath }),
     deleteSaved: (sessionId: string) =>
       socketEmit<boolean>('claude-session:delete-saved', { sessionId }),
     onEvent: (callback: (payload: { id: string; event: Record<string, unknown> }) => void) => {
       socket.on('claude-session:event', callback)
       return () => socket.off('claude-session:event', callback)
     },
     onDone: (callback: (payload: { id: string; exitCode: number; sessionId?: string }) => void) => {
       socket.on('claude-session:done', callback)
       return () => socket.off('claude-session:done', callback)
     },
     watchSubagents: (conversationId: string, parentSessionId: string, workspacePath: string,
       targets: { taskId?: string; name: string; description: string }[]) =>
       socketEmit<boolean>('claude-session:watch-subagents', { conversationId, parentSessionId, workspacePath, targets }),
     updateSubagentTargets: (targets: { taskId?: string; name: string; description: string }[]) =>
       socketEmit<boolean>('claude-session:update-subagent-targets', { targets }),
     stopSubagentWatch: () =>
       socketEmit<boolean>('claude-session:stop-subagent-watch', null),
     onSubagentActivity: (callback: (payload: unknown) => void) => {
       socket.on('claude-session:subagent-activity', callback)
       return () => socket.off('claude-session:subagent-activity', callback)
     }
   },

 11g. Add the zeus API object — workspace, claude, ide, system, claudeConfig, skills, mcp, plugin, files, git, and onAction:

   workspace: {
     list: () => socketEmit<unknown[]>('workspace:list', null),
     add: async () => {
       // No native dialog in browser — prompt user for path
       const wsPath = window.prompt('Enter workspace path (absolute):')
       if (!wsPath?.trim()) return null
       return socketEmit<unknown>('workspace:add-path', { wsPath: wsPath.trim() })
     },
     remove: (wsPath: string) => socketEmit<boolean>('workspace:remove', { wsPath }),
     rename: (wsPath: string, newName: string) => socketEmit<boolean>('workspace:rename', { wsPath, newName }),
     setLast: (wsPath: string) => socketEmit<boolean>('workspace:set-last', { wsPath }),
     getLast: () => socketEmit<string | null>('workspace:get-last', null),
     reorder: (orderedPaths: string[]) => socketEmit<boolean>('workspace:reorder', { orderedPaths })
   },

   claude: {
     isInstalled: () => socketEmit<boolean>('claude:is-installed', null),
     version: () => socketEmit<string | null>('claude:version', null),
     models: () => socketEmit<unknown[]>('claude:models', null),
     checkLatest: () => socketEmit<unknown>('claude:check-latest', null),
     update: () => socketEmit<unknown>('claude:update', null)
   },

   ide: {
     list: () => socketEmit<unknown[]>('ide:list', null),
     open: (ideCmd: string, workspacePath: string) =>
       socketEmit<{ success: boolean; error?: string }>('ide:open', { ideCmd, workspacePath }),
     getPreference: () => socketEmit<string>('ide:get-preference', null),
     setPreference: (ideId: string) => socketEmit<boolean>('ide:set-preference', { ideId })
   },

   system: {
     openExternal: (url: string) => { window.open(url, '_blank'); return Promise.resolve() },
     revealInFinder: (_filePath: string) => Promise.resolve(), // no-op in web
     getHome: () => socketEmit<string>('system:get-home', null),
     pathExists: (p: string) => socketEmit<boolean>('system:path-exists', { p }),
     getDirInfo: (dirPath: string) => socketEmit<unknown>('system:get-dir-info', { dirPath })
   },

   claudeConfig: {
     read: () => socketEmit<unknown>('claude-config:read', null),
     write: (config: object) => socketEmit<boolean>('claude-config:write', { config }),
     readProject: (wsPath: string) => socketEmit<unknown>('claude-config:read-project', { wsPath }),
     writeProject: (wsPath: string, config: object) =>
       socketEmit<boolean>('claude-config:write-project', { wsPath, config })
   },

   skills: {
     scan: (wsPath: string) => socketEmit<unknown[]>('skills:scan', { wsPath })
   },

   mcp: {
     install: (pkg: string) => socketEmit<unknown>('mcp:install', { pkg }),
     health: () => socketEmit<unknown[]>('mcp:health', null)
   },

   plugin: {
     list: () => socketEmit<unknown[]>('plugin:list', null),
     marketplaceList: () => socketEmit<unknown[]>('plugin:marketplace-list', null),
     install: (name: string, scope?: string) => socketEmit<unknown>('plugin:install', { name, scope }),
     uninstall: (name: string) => socketEmit<unknown>('plugin:uninstall', { name }),
     enable: (name: string, scope?: string) => socketEmit<unknown>('plugin:enable', { name, scope }),
     disable: (name: string, scope?: string) => socketEmit<unknown>('plugin:disable', { name, scope }),
     marketplaceAdd: (source: string) => socketEmit<unknown>('plugin:marketplace-add', { source })
   },

   files: {
     listMd: (dirPath: string) => socketEmit<unknown[]>('files:list-md', { dirPath }),
     read: (filePath: string) => socketEmit<string | null>('files:read', { filePath }),
     write: (filePath: string, content: string) => socketEmit<boolean>('files:write', { filePath, content })
   },

   git: {
     diff: (workspacePath: string) => socketEmit<string>('git:diff', { workspacePath }),
     diffFile: (workspacePath: string, filePath: string) =>
       socketEmit<string>('git:diff-file', { workspacePath, filePath }),
     changedFiles: (workspacePath: string) => socketEmit<unknown[]>('git:changed-files', { workspacePath })
   },

   // No-op in web: Electron menu actions replaced by keyboard shortcuts in App.svelte
   onAction: (_action: string, _callback: () => void) => () => {}
 }

 export function initZeus(): void {
   (window as Window & { zeus: typeof zeus }).zeus = zeus
 }

 ---
 Task 12 — Create vite.config.ts (replaces electron.vite.config.ts)

 Create /home/savvydev/projects/zeus/vite.config.ts. This replaces the Electron-specific electron.vite.config.ts.

 12a. Create the file with this exact content:

 import { defineConfig } from 'vite'
 import { svelte } from '@sveltejs/vite-plugin-svelte'

 export default defineConfig({
   root: 'src/renderer',
   plugins: [svelte({
     onwarn(warning, handler) {
       if (warning.code?.startsWith('a11y_')) return
       handler(warning)
     }
   })],
   build: {
     outDir: '../../dist',
     emptyOutDir: true
   },
   server: {
     proxy: {
       '/socket.io': {
         target: 'http://localhost:8080',
         ws: true
       }
     }
   }
 })

 NOTE: The svelte onwarn config is preserved from the original electron.vite.config.ts to suppress a11y warnings.

 ---
 Task 13 — Update package.json

 Edit /home/savvydev/projects/zeus/package.json. Make the following changes:

 13a. Change the "scripts" section — replace ALL existing scripts with:
   "scripts": {
     "dev": "vite --config vite.config.ts",
     "build": "vite build --config vite.config.ts",
     "preview": "vite preview --config vite.config.ts",
     "server": "node server/index.js",
     "typecheck": "tsc --noEmit"
   }

 13b. Remove the "main" field:
   REMOVE: "main": "./out/main/index.js"

 13c. Remove the entire "build" field (electron-builder config). This is the block starting with
   "build": { "appId": ... } that contains productName, directories, etc.

 13d. Remove the "postinstall" script line (it was inside "scripts" in the original — already handled by 13a).

 13e. Remove these packages from "devDependencies" (they are Electron-specific):
   - electron
   - electron-builder
   - electron-vite

 13f. Remove node-pty from "dependencies" (it is now only in server/package.json).

 13g. Add socket.io-client to "dependencies":
   "socket.io-client": "^4.7.5"

 13h. Add vite to "devDependencies" (if not already present):
   "vite": "^5.0.0"

 ---
 Task 14 — Update src/renderer/src/main.ts

 Edit /home/savvydev/projects/zeus/src/renderer/src/main.ts.

 14a. Add this import at the top of the file (before other imports):
   import { initZeus } from './lib/zeus.js'

 14b. Add this call BEFORE the mount() call:
   initZeus()

 The final file should look like:

 import { initZeus } from './lib/zeus.js'
 import App from './App.svelte'
 import { mount } from 'svelte'

 import './theme.css'
 import '@xterm/xterm/css/xterm.css'

 initZeus()

 const app = mount(App, { target: document.getElementById('app')! })

 export default app

 ---
 Task 15 — Update src/renderer/src/App.svelte

 Edit /home/savvydev/projects/zeus/src/renderer/src/App.svelte. Make these changes:

 15a. Remove the onDestroy cleanup for Electron menu actions.

 In the onMount function, find and REMOVE these lines:
   unsubs.push(
     window.zeus.onAction('new-terminal', () => newTerminal()),
     window.zeus.onAction('run-claude', () => runClaude()),
     window.zeus.onAction('clear-terminal', () => terminalStore.clearActive())
   )

 Also REMOVE the unsubs declaration and onDestroy cleanup:
   let unsubs: Array<() => void> = []
   ...
   onDestroy(() => {
     terminalStore.unlisten()
     claudeSessionStore.unlisten()
     unsubs.forEach((fn) => fn())
   })

 REPLACE the onDestroy with:
   onDestroy(() => {
     terminalStore.unlisten()
     claudeSessionStore.unlisten()
   })

 15b. Remove the titlebar div. Find and DELETE:
   <div class="titlebar">
     <span class="titlebar-text">Zeus</span>
   </div>

 15c. Remove the titlebar CSS. Find and DELETE both CSS rule blocks:
   .titlebar { ... }
   .titlebar-text { ... }

 15d. Update the .app CSS — remove the titlebar height offset:
   BEFORE: height: calc(100vh - 52px);
   AFTER:  height: 100vh;

 ---
 Task 16 — Create Dockerfile

 Create /home/savvydev/projects/zeus/Dockerfile with this content:

 16a. Create the file with this exact content:

 # ── Stage 1: Build frontend ────────────────────────────────────────────────────
 FROM node:20-slim AS builder

 WORKDIR /app
 COPY package.json package-lock.json ./
 RUN npm ci

 COPY vite.config.ts svelte.config.js tsconfig.json tsconfig.web.json ./
 COPY src/renderer src/renderer

 RUN npm run build

 # Install server deps separately (no devDeps needed at runtime)
 COPY server/package.json server/package.json
 RUN cd server && npm install --production

 # ── Stage 2: Runtime ───────────────────────────────────────────────────────────
 FROM node:20-slim

 RUN apt-get update && apt-get install -y --no-install-recommends \
       build-essential python3 git curl \
     && rm -rf /var/lib/apt/lists/*

 WORKDIR /app

 COPY --from=builder /app/dist ./dist
 COPY server ./server
 COPY --from=builder /app/server/node_modules ./server/node_modules

 # Rebuild node-pty for this architecture
 RUN cd server && npm rebuild node-pty

 EXPOSE 8080
 CMD ["node", "server/index.js"]

 ---
 Task 17 — Create docker-compose.yml

 Create /home/savvydev/projects/zeus/docker-compose.yml with this content:

 17a. Create the file with this exact content (NOTE: no :ro flag — the app needs read-write access to workspaces for file editing, Claude Code, and terminal commands):

 version: '3.8'
 services:
   zeus:
     build: .
     ports:
       - '8080:8080'
     volumes:
       - "${HOME}:/root"
       - zeus-data:/app/server/data
     restart: unless-stopped

 volumes:
   zeus-data:

 ---
 Task 18 — Update .gitignore

 Edit /home/savvydev/projects/zeus/.gitignore.

 18a. Add these entries if not already present:
   dist/
   server/node_modules/

 ---
 Task 19 — Delete src/main/index.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/index.ts
 Reason: Replaced by server/index.js (Task 10).

 ---
 Task 20 — Delete src/main/store.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/store.ts
 Reason: Replaced by server/store.js (Task 2).

 ---
 Task 21 — Delete src/main/claude-cli.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/claude-cli.ts
 Reason: Replaced by server/claude-cli.js (Task 3).

 ---
 Task 22 — Delete src/main/claude-config.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/claude-config.ts
 Reason: Replaced by server/claude-config.js (Task 4).

 ---
 Task 23 — Delete src/main/skills.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/skills.ts
 Reason: Replaced by server/skills.js (Task 5).

 ---
 Task 24 — Delete src/main/files.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/files.ts
 Reason: Replaced by server/files.js (Task 6).

 ---
 Task 25 — Delete src/main/terminal.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/terminal.ts
 Reason: Replaced by server/terminal.js (Task 7).

 ---
 Task 26 — Delete src/main/claude-session.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/claude-session.ts
 Reason: Replaced by server/claude-session.js (Task 8).

 ---
 Task 27 — Delete src/main/subagent-watcher.ts

 Delete the file: /home/savvydev/projects/zeus/src/main/subagent-watcher.ts
 Reason: Replaced by server/subagent-watcher.js (Task 9).

 ---
 Task 28 — Delete src/preload/index.ts

 Delete the file: /home/savvydev/projects/zeus/src/preload/index.ts
 Reason: Replaced by src/renderer/src/lib/zeus.ts (Task 11). xterm.js now lives in the renderer shim.

 ---
 Task 29 — Delete electron.vite.config.ts

 Delete the file: /home/savvydev/projects/zeus/electron.vite.config.ts
 Reason: Replaced by vite.config.ts (Task 12).

 ---
 Task 30 — Delete tsconfig.node.json and build info

 30a. Delete: /home/savvydev/projects/zeus/tsconfig.node.json
 30b. Delete: /home/savvydev/projects/zeus/tsconfig.node.tsbuildinfo
 Reason: These are for the Electron main/preload TypeScript config. The server runs plain JS, no TS compilation needed.

 ---
 Task 31 — Delete the src/main directory

 After all individual files in src/main/ have been deleted (Tasks 19–27), delete the now-empty directory:
   rm -rf /home/savvydev/projects/zeus/src/main

 ---
 Task 32 — Delete the src/preload directory

 After src/preload/index.ts has been deleted (Task 28), delete the now-empty directory:
   rm -rf /home/savvydev/projects/zeus/src/preload

 ---
 Task 33 — Install dependencies

 33a. Install root project dependencies:
   cd /home/savvydev/projects/zeus && npm install

 33b. Install server dependencies:
   cd /home/savvydev/projects/zeus/server && npm install

 ---
 Task 34 — Verify the build

 34a. Build the frontend:
   cd /home/savvydev/projects/zeus && npm run build

 34b. Start the server (smoke test):
   cd /home/savvydev/projects/zeus && npm run server
   Verify it prints: "[zeus] Server running at http://0.0.0.0:8080"
   Then Ctrl-C to stop.

 34c. Optional: Run typecheck:
   cd /home/savvydev/projects/zeus && npm run typecheck

 ═══════════════════════════════════════════════════════════════════════════════
 Verification Checklist
 ═══════════════════════════════════════════════════════════════════════════════

 After completing all tasks, verify:

 Files Created:
   [ ] server/package.json           (Task 1)
   [ ] server/store.js               (Task 2)
   [ ] server/claude-cli.js          (Task 3)
   [ ] server/claude-config.js       (Task 4)
   [ ] server/skills.js              (Task 5)
   [ ] server/files.js               (Task 6)
   [ ] server/terminal.js            (Task 7)
   [ ] server/claude-session.js      (Task 8)
   [ ] server/subagent-watcher.js    (Task 9)
   [ ] server/index.js               (Task 10)
   [ ] src/renderer/src/lib/zeus.ts  (Task 11)
   [ ] vite.config.ts                (Task 12)
   [ ] Dockerfile                    (Task 16)
   [ ] docker-compose.yml            (Task 17)

 Files Modified:
   [ ] package.json                  (Task 13)
   [ ] src/renderer/src/main.ts      (Task 14)
   [ ] src/renderer/src/App.svelte   (Task 15)
   [ ] .gitignore                    (Task 18)

 Files Deleted:
   [ ] src/main/index.ts             (Task 19)
   [ ] src/main/store.ts             (Task 20)
   [ ] src/main/claude-cli.ts        (Task 21)
   [ ] src/main/claude-config.ts     (Task 22)
   [ ] src/main/skills.ts            (Task 23)
   [ ] src/main/files.ts             (Task 24)
   [ ] src/main/terminal.ts          (Task 25)
   [ ] src/main/claude-session.ts    (Task 26)
   [ ] src/main/subagent-watcher.ts  (Task 27)
   [ ] src/preload/index.ts          (Task 28)
   [ ] electron.vite.config.ts       (Task 29)
   [ ] tsconfig.node.json            (Task 30)
   [ ] tsconfig.node.tsbuildinfo     (Task 30)

 Directories Deleted:
   [ ] src/main/                     (Task 31)
   [ ] src/preload/                  (Task 32)

 Zero Electron imports remaining:
   [ ] grep -r "from 'electron'" src/ → no matches
   [ ] grep -r "require('electron')" src/ → no matches
   [ ] grep -r "electron-vite" . --include="*.json" --include="*.ts" → no matches

 Build passes:
   [ ] npm run build succeeds         (Task 34a)
   [ ] npm run server starts cleanly  (Task 34b)

 ═══════════════════════════════════════════════════════════════════════════════
 Execution Order
 ═══════════════════════════════════════════════════════════════════════════════

 Phase 1 — Create server modules (no dependencies between them):
   Tasks 1, 2, 3, 4, 5, 6, 7 (can be done in parallel)

 Phase 2 — Create server modules that depend on Phase 1 output:
   Tasks 8, 9 (depend on understanding but not on file output from Phase 1)
   Task 10 (imports all Phase 1 modules — create last in this phase)

 Phase 3 — Frontend changes:
   Task 11 (create zeus.ts shim)
   Task 12 (create vite.config.ts)
   Task 13 (update package.json)
   Task 14 (update main.ts — depends on Task 11)
   Task 15 (update App.svelte)

 Phase 4 — Docker & infrastructure:
   Tasks 16, 17, 18 (can be done in parallel)

 Phase 5 — Cleanup:
   Tasks 19–32 (delete old files — do AFTER all creates/edits are verified)

 Phase 6 — Verify:
   Tasks 33, 34