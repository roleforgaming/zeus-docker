import { contextBridge, ipcRenderer } from 'electron'
import path from 'node:path'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

// Optional addons — gracefully degrade
let WebglAddon: typeof import('@xterm/addon-webgl').WebglAddon | null = null
let WebLinksAddon: typeof import('@xterm/addon-web-links').WebLinksAddon | null = null
try { WebglAddon = require('@xterm/addon-webgl').WebglAddon } catch {}
try { WebLinksAddon = require('@xterm/addon-web-links').WebLinksAddon } catch {}

// ── Xterm CSS path for renderer injection ──────────────────────────────────────
const xtermCssPath = path.join(__dirname, '../../node_modules/@xterm/xterm/css/xterm.css')

// ── Local xterm instances (live in preload's isolated world) ───────────────────
interface LocalTerminal {
  xterm: Terminal
  fitAddon: FitAddon
}
const localTerminals = new Map<number, LocalTerminal>()

// ── Terminal Theme ─────────────────────────────────────────────────────────────
const THEME = {
  background: '#0d0d0d',
  foreground: '#e6e6e6',
  cursor: '#c084fc',
  cursorAccent: '#0d0d0d',
  selectionBackground: 'rgba(192, 132, 252, 0.3)',
  selectionForeground: '#ffffff',
  black: '#1a1a1a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e6e6e6',
  brightBlack: '#666666',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff'
} as const

// ── Expose typed API ───────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('zeus', {
  // ── Workspace ──
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    add: () => ipcRenderer.invoke('workspace:add'),
    remove: (wsPath: string) => ipcRenderer.invoke('workspace:remove', wsPath),
    setLast: (wsPath: string) => ipcRenderer.invoke('workspace:set-last', wsPath),
    getLast: () => ipcRenderer.invoke('workspace:get-last')
  },

  // ── Terminal ──
  terminal: {
    create: (workspacePath?: string) => ipcRenderer.invoke('terminal:create', workspacePath),

    attach: (termId: number, elementId: string) => {
      const container = document.getElementById(elementId)
      if (!container) throw new Error(`Element #${elementId} not found`)

      const xterm = new Terminal({
        fontSize: 14,
        fontFamily:
          "'D2Coding ligature', D2Coding, 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
        lineHeight: 1.2,
        theme: THEME,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowTransparency: true,
        scrollback: 10000,
        tabStopWidth: 4,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 1
      })

      const fitAddon = new FitAddon()
      xterm.loadAddon(fitAddon)

      if (WebLinksAddon) {
        xterm.loadAddon(
          new WebLinksAddon((_: MouseEvent, uri: string) => {
            ipcRenderer.invoke('system:open-external', uri)
          })
        )
      }

      xterm.open(container)

      // GPU-accelerated rendering
      if (WebglAddon) {
        try {
          const webgl = new WebglAddon()
          webgl.onContextLoss(() => webgl.dispose())
          xterm.loadAddon(webgl)
        } catch {
          /* canvas fallback */
        }
      }

      fitAddon.fit()

      xterm.onData((data) => ipcRenderer.send('terminal:write', { id: termId, data }))
      xterm.onResize(({ cols, rows }) =>
        ipcRenderer.send('terminal:resize', { id: termId, cols, rows })
      )

      localTerminals.set(termId, { xterm, fitAddon })
      ipcRenderer.send('terminal:resize', { id: termId, cols: xterm.cols, rows: xterm.rows })

      return { cols: xterm.cols, rows: xterm.rows }
    },

    writeToPty: (termId: number, data: string) =>
      ipcRenderer.send('terminal:write', { id: termId, data }),

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

    kill: async (termId: number) => {
      localTerminals.get(termId)?.xterm.dispose()
      localTerminals.delete(termId)
      return ipcRenderer.invoke('terminal:kill', termId)
    },

    onData: (callback: (payload: { id: number; data: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { id: number; data: string }) => {
        localTerminals.get(payload.id)?.xterm.write(payload.data)
        callback(payload)
      }
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },

    onExit: (callback: (payload: { id: number; exitCode: number }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { id: number; exitCode: number }) => {
        localTerminals
          .get(payload.id)
          ?.xterm.writeln(`\r\n\x1B[90m[Process exited with code ${payload.exitCode}]\x1B[0m`)
        callback(payload)
      }
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    }
  },

  // ── Claude Code ──
  claude: {
    isInstalled: () => ipcRenderer.invoke('claude:is-installed'),
    version: () => ipcRenderer.invoke('claude:version'),
    update: () => ipcRenderer.invoke('claude:update')
  },

  // ── IDE ──
  ide: {
    list: () => ipcRenderer.invoke('ide:list'),
    open: (ideCmd: string, workspacePath: string) =>
      ipcRenderer.invoke('ide:open', { ideCmd, workspacePath }),
    getPreference: () => ipcRenderer.invoke('ide:get-preference'),
    setPreference: (ideId: string) => ipcRenderer.invoke('ide:set-preference', ideId)
  },

  // ── System ──
  system: {
    openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
    revealInFinder: (p: string) => ipcRenderer.invoke('system:reveal-in-finder', p),
    getHome: () => ipcRenderer.invoke('system:get-home'),
    pathExists: (p: string) => ipcRenderer.invoke('system:path-exists', p),
    getDirInfo: (dirPath: string) => ipcRenderer.invoke('system:get-dir-info', dirPath)
  },

  // ── Menu Actions ──
  onAction: (action: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`action:${action}`, handler)
    return () => ipcRenderer.removeListener(`action:${action}`, handler)
  },

  xtermCssPath
})
