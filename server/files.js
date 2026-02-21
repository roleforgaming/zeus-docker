/**
 * File system helpers — markdown listing, file I/O, git diff, and transcript reading.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { SKIP_DIRS } from './skills.js'

// ── Markdown File Listing ──────────────────────────────────────────────────────

const CLAUDE_ROOT_FILES = new Set([
  'claude.md', 'agents.md', 'agent.md', 'claude_instructions.md',
  'claudeignore', '.claudeignore'
])

export function listMarkdownFiles(dirPath) {
  const results = []
  if (!dirPath || !fs.existsSync(dirPath)) return results

  try {
    collectClaudeRootMd(dirPath, dirPath, results)
    const rootClaudeDir = path.join(dirPath, '.claude')
    if (fs.existsSync(rootClaudeDir)) {
      collectAllMdInDir(rootClaudeDir, dirPath, results, 0)
    }
    scanChildrenForClaudeMd(dirPath, dirPath, results, 0)
  } catch { /* ignore */ }

  return results.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir.localeCompare(b.dir)
    return a.name.localeCompare(b.name)
  })
}

function collectClaudeRootMd(dir, rootDir, results) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (CLAUDE_ROOT_FILES.has(entry.name.toLowerCase())) {
        addMdEntry(path.join(dir, entry.name), rootDir, results)
      }
    }
  } catch { /* ignore */ }
}

function collectAllMdInDir(dir, rootDir, results, depth) {
  if (depth > 8) return
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && /\.md$/i.test(entry.name)) {
        addMdEntry(fullPath, rootDir, results)
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        collectAllMdInDir(fullPath, rootDir, results, depth + 1)
      }
    }
  } catch { /* ignore */ }
}

function scanChildrenForClaudeMd(dir, rootDir, results, depth) {
  if (depth > 3) return
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      if (SKIP_DIRS.has(entry.name)) continue
      const childPath = path.join(dir, entry.name)
      collectClaudeRootMd(childPath, rootDir, results)
      const claudeDir = path.join(childPath, '.claude')
      if (fs.existsSync(claudeDir)) {
        collectAllMdInDir(claudeDir, rootDir, results, 0)
      }
      scanChildrenForClaudeMd(childPath, rootDir, results, depth + 1)
    }
  } catch { /* ignore */ }
}

function addMdEntry(fullPath, rootDir, results) {
  if (results.some((r) => r.path === fullPath)) return
  try {
    const stat = fs.statSync(fullPath)
    const relativePath = path.relative(rootDir, fullPath)
    const relDir = path.dirname(relativePath)
    results.push({
      name: path.basename(fullPath),
      path: fullPath,
      size: stat.size,
      relativePath,
      dir: relDir === '.' ? '.' : relDir
    })
  } catch { /* ignore */ }
}

// ── Path Validation ────────────────────────────────────────────────────────────

/** Validate that a file path is within a known workspace or home dir */
export function isPathAllowed(filePath, store) {
  const resolved = path.resolve(filePath)
  const home = os.homedir()
  for (const ws of store.workspaces) {
    if (resolved.startsWith(ws.path + path.sep) || resolved === ws.path) return true
  }
  if (resolved.startsWith(home + path.sep) || resolved === home) return true
  return false
}

export function readFileContent(filePath, store) {
  try {
    if (!isPathAllowed(filePath, store)) {
      console.warn('[zeus] readFileContent blocked — path outside allowed scope:', filePath)
      return null
    }
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

export function writeFileContent(filePath, content, store) {
  try {
    if (!isPathAllowed(filePath, store)) {
      console.warn('[zeus] writeFileContent blocked — path outside allowed scope:', filePath)
      return false
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

// ── Git Diff ───────────────────────────────────────────────────────────────────

const GIT_EXEC_OPTS = {
  encoding: 'utf-8',
  timeout: 10000,
  maxBuffer: 5 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe']
}

export function getGitDiff(workspacePath) {
  try {
    const diff = execSync('git diff HEAD', { cwd: workspacePath, ...GIT_EXEC_OPTS })
    if (!diff.trim()) {
      return execSync('git diff', { cwd: workspacePath, ...GIT_EXEC_OPTS })
    }
    return diff
  } catch {
    return ''
  }
}

export function getGitDiffFile(workspacePath, filePath) {
  try {
    const diff = execSync(`git diff HEAD -- "${filePath}"`, { cwd: workspacePath, ...GIT_EXEC_OPTS })
    if (!diff.trim()) {
      return execSync(`git diff -- "${filePath}"`, { cwd: workspacePath, ...GIT_EXEC_OPTS })
    }
    return diff
  } catch {
    return ''
  }
}

export function getGitChangedFiles(workspacePath) {
  try {
    const files = parseGitNumstat(workspacePath, 'git diff HEAD --numstat', 'git diff HEAD --name-status')
    if (files.length > 0) return files
    // Fallback to unstaged changes
    return parseGitNumstat(workspacePath, 'git diff --numstat', 'git diff --name-status')
  } catch {
    return []
  }
}

function parseGitNumstat(workspacePath, numstatCmd, nameStatusCmd) {
  const numstat = execSync(numstatCmd, { cwd: workspacePath, ...GIT_EXEC_OPTS }).trim()
  const nameStatus = execSync(nameStatusCmd, { cwd: workspacePath, ...GIT_EXEC_OPTS }).trim()
  if (!numstat) return []

  const statusMap = new Map()
  for (const line of nameStatus.split('\n')) {
    if (!line.trim()) continue
    const [status, ...rest] = line.split('\t')
    const fpath = rest.join('\t')
    if (fpath) statusMap.set(fpath, status)
  }

  const files = []
  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue
    const [add, del, ...rest] = line.split('\t')
    const fpath = rest.join('\t')
    if (!fpath) continue
    const rawStatus = statusMap.get(fpath) ?? 'M'
    let status = 'modified'
    if (rawStatus.startsWith('A')) status = 'added'
    else if (rawStatus.startsWith('D')) status = 'deleted'
    else if (rawStatus.startsWith('R')) status = 'renamed'
    files.push({ path: fpath, status, additions: parseInt(add) || 0, deletions: parseInt(del) || 0 })
  }
  return files
}

// ── Claude Transcript Reader ───────────────────────────────────────────────────

export function readClaudeTranscript(sessionId, workspacePath) {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')
  const encoded = workspacePath.replace(/\//g, '-')

  let jsonlPath = null

  // Try the project dir first
  const candidates = [encoded]
  if (encoded.startsWith('-')) candidates.push(encoded)
  for (const candidate of candidates) {
    const p = path.join(claudeDir, candidate, `${sessionId}.jsonl`)
    if (fs.existsSync(p)) { jsonlPath = p; break }
  }

  // Fallback: search all project dirs
  if (!jsonlPath) {
    try {
      const dirs = fs.readdirSync(claudeDir)
      for (const dir of dirs) {
        const p = path.join(claudeDir, dir, `${sessionId}.jsonl`)
        if (fs.existsSync(p)) { jsonlPath = p; break }
      }
    } catch { /* ignore */ }
  }

  if (!jsonlPath) return []

  try {
    const raw = fs.readFileSync(jsonlPath, 'utf-8')
    const lines = raw.split('\n').filter((l) => l.trim())
    const messages = []

    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        const type = obj.type
        const msg = obj.message
        const timestamp = obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now()

        if (type === 'user' && msg?.role === 'user') {
          const content = msg.content
          let text = ''
          if (typeof content === 'string') {
            text = content
          } else if (Array.isArray(content)) {
            const textParts = []
            for (const part of content) {
              if (typeof part === 'string') textParts.push(part)
              else if (part?.type === 'text' && typeof part.text === 'string') {
                if (!part.text.startsWith('<ide_opened_file>') && !part.text.startsWith('<ide_')) {
                  textParts.push(part.text)
                }
              }
            }
            text = textParts.join('\n')
          }
          if (text.trim()) {
            const trimmed = text.trim()
            messages.push({
              id: obj.uuid || `msg-${timestamp}-user`,
              role: 'user',
              content: trimmed,
              // displayContent is only set by Zeus's send() at runtime;
              // transcript doesn't have it, so leave undefined
              timestamp
            })
          }
        } else if (type === 'assistant' && msg?.role === 'assistant') {
          const content = msg.content
          const blocks = []
          const textParts = []

          if (typeof content === 'string') {
            textParts.push(content)
            blocks.push({ type: 'text', text: content })
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (typeof part === 'string') {
                textParts.push(part)
                blocks.push({ type: 'text', text: part })
              } else if (part?.type === 'text' && typeof part.text === 'string') {
                textParts.push(part.text)
                blocks.push({ type: 'text', text: part.text })
              } else if (part?.type === 'thinking' && typeof part.thinking === 'string') {
                blocks.push({ type: 'thinking', thinking: part.thinking.slice(0, 300) })
              } else if (part?.type === 'tool_use') {
                blocks.push({
                  type: 'tool_use',
                  name: part.name || 'unknown',
                  input: part.input || {}
                })
              }
            }
          }

          if (textParts.join('').trim() || blocks.length > 0) {
            messages.push({
              id: obj.uuid || `msg-${timestamp}-assistant`,
              role: 'assistant',
              content: textParts.join('\n'),
              blocks: blocks.length > 0 ? blocks : undefined,
              timestamp
            })
          }
        }
      } catch { /* skip malformed lines */ }
    }

    // Merge consecutive assistant messages
    const merged = []
    for (const msg of messages) {
      const prev = merged[merged.length - 1]
      if (prev && prev.role === 'assistant' && msg.role === 'assistant') {
        if (msg.content) {
          prev.content = prev.content ? prev.content + '\n' + msg.content : msg.content
        }
        if (msg.blocks) {
          prev.blocks = [...(prev.blocks || []), ...msg.blocks]
        }
      } else {
        merged.push({ ...msg })
      }
    }
    return merged
  } catch (e) {
    console.error('[zeus] Failed to read Claude transcript:', e)
    return []
  }
}
