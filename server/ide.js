/**
 * IDE management — detection of installed desktop IDEs, virtual IDE entries,
 * and workspace-aware open logic.
 */
import { spawnSync, spawn } from 'node:child_process'
import { execSync } from 'node:child_process'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Candidate desktop IDEs to probe via `which` */
const DESKTOP_IDE_CANDIDATES = [
  { id: 'code',        name: 'VS Code',       cmd: 'code',        icon: 'vscode'      },
  { id: 'cursor',      name: 'Cursor',        cmd: 'cursor',      icon: 'cursor'      },
  { id: 'windsurf',    name: 'Windsurf',      cmd: 'windsurf',    icon: 'windsurf'    },
  { id: 'zed',         name: 'Zed',           cmd: 'zed',         icon: 'zed'         },
  { id: 'idea',        name: 'IntelliJ IDEA', cmd: 'idea',        icon: 'idea'        },
  { id: 'webstorm',    name: 'WebStorm',      cmd: 'webstorm',    icon: 'webstorm'    },
  { id: 'sublime',     name: 'Sublime Text',  cmd: 'subl',        icon: 'sublime'     },
  { id: 'nvim',        name: 'Neovim',        cmd: 'nvim',        icon: 'vim'         },
  { id: 'antigravity', name: 'Anti-Gravity',  cmd: 'antigravity', icon: 'antigravity' },
]

/** Virtual IDE entries always present regardless of local install */
const VIRTUAL_IDES = [
  {
    id:   'vscode-host',
    name: 'VS Code (Local Host)',
    cmd:  'code',
    type: 'local',
    icon: 'vscode',
  },
  {
    id:   'codeserver',
    name: 'Code Server',
    cmd:  'http://localhost:8080',
    type: 'browser',
    icon: 'codeserver',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return true if `cmd` is resolvable in the current PATH.
 * Uses the user's login shell first so GUI-launched processes see the full PATH.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function isCommandAvailable(cmd) {
  // Strategy 1: login shell (captures ~/.zshrc / ~/.bashrc PATH extensions)
  if (process.platform !== 'win32') {
    try {
      const shell = process.env.SHELL || '/bin/bash'
      const result = execSync(`${shell} -l -c 'which ${cmd}'`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      if (result.length > 0) return true
    } catch { /* fall through to strategy 2 */ }
  }

  // Strategy 2: direct which / where
  try {
    const whichCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    const result = execSync(whichCmd, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return result.length > 0
  } catch {
    return false
  }
}

/**
 * Resolve a workspace path, replacing the `/workspace` container prefix with
 * the host path from HOST_WORKSPACES_PATH when running inside Docker.
 *
 * @param {string} workspacePath
 * @returns {string}
 */
function resolveWorkspacePath(workspacePath) {
  const hostBase = process.env.HOST_WORKSPACES_PATH
  if (hostBase && workspacePath.startsWith('/workspace')) {
    return workspacePath.replace(/^\/workspace/, hostBase)
  }
  return workspacePath
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Return all available IDEs: virtual entries (always present) plus any
 * desktop IDEs detected on the current machine.
 *
 * @returns {Array<{id: string, name: string, cmd: string, type?: string, icon?: string}>}
 */
export function getIDEs() {
  const detected = DESKTOP_IDE_CANDIDATES
    .filter((ide) => isCommandAvailable(ide.cmd))
    .map((ide) => ({ ...ide, type: 'local' }))

  // Virtual entries come first; deduplicate by id in case a virtual entry
  // (e.g. vscode-host / code) also appears in the detected list.
  const detectedIds = new Set(detected.map((d) => d.id))
  const uniqueVirtual = VIRTUAL_IDES.filter((v) => !detectedIds.has(v.id))

  return [...uniqueVirtual, ...detected]
}

/**
 * Open a workspace in the specified IDE.
 *
 * - If `cmd` is an http/https URL, return the URL immediately — the caller is
 *   responsible for opening it in the browser.
 * - Otherwise spawn the IDE binary with the resolved workspace path.
 *
 * @param {string} cmd            IDE binary name or URL
 * @param {string} workspacePath  Absolute path to the workspace directory
 * @returns {{ url: string } | { success: boolean, error?: string }}
 */
export function openIDE(cmd, workspacePath) {
  // Browser-based IDE: return URL for the caller to open
  if (/^https?:\/\//i.test(cmd)) {
    return { url: cmd }
  }

  const resolvedPath = resolveWorkspacePath(workspacePath)

  try {
    const child = spawn(cmd, [resolvedPath], {
      detached: true,
      stdio: 'ignore',
      shell: false,
    })
    child.unref()
    return { success: true }
  } catch (err) {
    console.error(`[ide] Failed to open IDE "${cmd}" at "${resolvedPath}":`, err.message)
    return { success: false, error: err.message }
  }
}
