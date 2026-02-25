/**
 * Claude Code configuration, MCP health checks, and plugin management.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { getClaudeCliPath, getShellEnv } from './claude-cli.js'

// ── Claude Config ──────────────────────────────────────────────────────────────

function getClaudeConfigPath() {
  return path.join(os.homedir(), '.claude.json')
}

export function readClaudeConfig() {
  try {
    const p = getClaudeConfigPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { /* ignore */ }
  return {}
}

export function writeClaudeConfig(config) {
  try {
    fs.writeFileSync(getClaudeConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

export function readProjectClaudeConfig(wsPath) {
  try {
    const p = path.join(wsPath, '.claude', 'settings.json')
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { /* ignore */ }
  return {}
}

export function writeProjectClaudeConfig(wsPath, config) {
  try {
    const dir = path.join(wsPath, '.claude')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

// ── MCP ────────────────────────────────────────────────────────────────────────

export function installMCPPackage(pkg) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', pkg], { shell: true, env: getShellEnv() })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      if (code === 0) resolve({ success: true, output: stdout })
      else resolve({ success: false, error: stderr || `Exit code ${code}` })
    })
    child.on('error', (err) => resolve({ success: false, error: err.message }))
  })
}

export function checkMcpHealth() {
  return new Promise((resolve) => {
    const claudePath = getClaudeCliPath()
    const child = spawn(claudePath, ['mcp', 'list'], {
      shell: true,
      env: getShellEnv(),
      timeout: 30000
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('close', () => {
      const entries = []
      const combined = stdout + stderr
      for (const line of combined.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('Checking')) continue
        const match = trimmed.match(
          /^(.+?):\s+(.+?)\s*(?:\((\w+)\)\s*)?-\s+[✓✗]\s*(.+)$/
        )
        if (!match) continue
        const [, rawName, command, transport, statusText] = match
        const connected = statusText.trim().toLowerCase().includes('connected')
        entries.push({
          name: rawName.trim(),
          command: command.trim(),
          transport: transport || '',
          status: connected ? 'connected' : 'failed',
          error: connected ? undefined : statusText.trim()
        })
      }
      resolve(entries)
    })
    child.on('error', () => resolve([]))
  })
}

// ── Plugins ────────────────────────────────────────────────────────────────────

export function listPlugins() {
  return new Promise((resolve) => {
    const claudePath = getClaudeCliPath()
    const child = spawn(claudePath, ['plugin', 'list'], {
      shell: true,
      env: getShellEnv(),
      timeout: 15000
    })
    let stdout = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.on('close', () => {
      const plugins = []
      const blocks = stdout.split(/\n\s*❯\s+/).filter(Boolean)
      for (const block of blocks) {
        const lines = block.trim().split('\n')
        const nameLine = lines[0]?.trim()
        if (!nameLine) continue
        const versionLine = lines.find(l => l.includes('Version:'))
        const scopeLine = lines.find(l => l.includes('Scope:'))
        const statusLine = lines.find(l => l.includes('Status:'))
        if (!versionLine || !scopeLine || !statusLine) continue
        if (!nameLine.includes('@')) continue
        plugins.push({
          name: nameLine,
          version: versionLine.replace(/.*Version:\s*/, '').trim(),
          scope: scopeLine.replace(/.*Scope:\s*/, '').trim(),
          enabled: statusLine.includes('enabled')
        })
      }
      resolve(plugins)
    })
    child.on('error', () => resolve([]))
  })
}

export function listMarketplaces() {
  return new Promise((resolve) => {
    const claudePath = getClaudeCliPath()
    const child = spawn(claudePath, ['plugin', 'marketplace', 'list'], {
      shell: true,
      env: getShellEnv(),
      timeout: 15000
    })
    let stdout = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.on('close', () => {
      const marketplaces = []
      const blocks = stdout.split(/\n\s*❯\s+/).filter(Boolean)
      for (const block of blocks) {
        const lines = block.trim().split('\n')
        const name = lines[0]?.trim()
        if (!name) continue
        if (!lines.some(l => l.includes('Source:'))) continue
        const source = lines.find(l => l.includes('Source:'))?.replace(/.*Source:\s*/, '').trim() || ''
        marketplaces.push({ name, source })
      }
      resolve(marketplaces)
    })
    child.on('error', () => resolve([]))
  })
}

export function runPluginCmd(action, target, scope) {
  return new Promise((resolve) => {
    const claudePath = getClaudeCliPath()
    const args = ['plugin', ...action.split(' '), target]
    if (scope && (action === 'install' || action === 'enable' || action === 'disable')) {
      args.push('--scope', scope)
    }
    console.log(`[zeus] Running: ${claudePath} ${args.join(' ')}`)
    const child = spawn(claudePath, args, {
      shell: true,
      env: getShellEnv(),
      timeout: 30000
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      if (code === 0) resolve({ success: true, output: stdout })
      else {
        const error = stderr || stdout || `Exit code ${code}`
        console.error(`[zeus] plugin command failed (${args.join(' ')}):`, error)
        resolve({ success: false, error })
      }
    })
    child.on('error', (err) => {
      console.error(`[zeus] plugin command error (${args.join(' ')}):`, err.message)
      resolve({ success: false, error: err.message })
    })
  })
}
