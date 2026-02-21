/**
 * Subagent JSONL Watcher — monitors child session JSONL files to surface
 * real-time tool activity from subagents.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// ── Human-readable tool labels ─────────────────────────────────────────────────

const TOOL_LABELS = {
  read: 'Reading',
  write: 'Writing',
  edit: 'Editing',
  multiEdit: 'Multi-editing',
  bash: 'Running command',
  glob: 'Searching files',
  grep: 'Searching code',
  ls: 'Listing directory',
  task: 'Dispatching agent',
  taskoutput: 'Waiting for agent',
  webfetch: 'Fetching web',
  todoread: 'Reading TODOs',
  todowrite: 'Writing TODOs',
}

// ── Module State ───────────────────────────────────────────────────────────────

let _emit = (event, data) => {}
let _state = null

// ── Init ───────────────────────────────────────────────────────────────────────

export function initSubagentWatcher(emitFn) {
  _emit = emitFn
}

// ── Project Directory Resolution ───────────────────────────────────────────────

function findProjectDir(parentSessionId, workspacePath) {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeDir)) return null

  const encoded = workspacePath.replace(/\//g, '-')

  const direct = path.join(claudeDir, encoded)
  if (fs.existsSync(direct) && fs.existsSync(path.join(direct, `${parentSessionId}.jsonl`))) {
    return direct
  }

  try {
    for (const dir of fs.readdirSync(claudeDir)) {
      const candidate = path.join(claudeDir, dir)
      if (fs.statSync(candidate).isDirectory()) {
        if (fs.existsSync(path.join(candidate, `${parentSessionId}.jsonl`))) {
          return candidate
        }
      }
    }
  } catch {}

  return null
}

// ── File Parsing ───────────────────────────────────────────────────────────────

function readFileTail(filePath, bytes) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const stat = fs.fstatSync(fd)
    const start = Math.max(0, stat.size - bytes)
    const len = stat.size - start
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, start)
    return buf.toString('utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

function formatToolStatus(toolName, input) {
  const label = TOOL_LABELS[toolName] ?? TOOL_LABELS[toolName.toLowerCase()] ?? toolName
  const detail = typeof input.file_path === 'string' ? input.file_path
    : typeof input.command === 'string' ? input.command.slice(0, 60)
    : typeof input.pattern === 'string' ? input.pattern
    : typeof input.query === 'string' ? input.query.slice(0, 60)
    : typeof input.path === 'string' ? input.path
    : ''
  return detail ? `${label}: ${detail}` : label
}

function extractLatestActivity(content) {
  const lines = content.split('\n').filter(l => l.trim())

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i])
      if (obj.type !== 'assistant' || !obj.message?.content) continue

      const blocks = Array.isArray(obj.message.content) ? obj.message.content : []

      for (let j = blocks.length - 1; j >= 0; j--) {
        const b = blocks[j]
        if (b.type === 'tool_use' && b.name) {
          const input = (b.input && typeof b.input === 'object') ? b.input : {}
          return { tool: b.name, status: formatToolStatus(b.name, input) }
        }
        if (b.type === 'thinking') return { status: 'Thinking…' }
        if (b.type === 'text' && b.text) return { status: 'Writing…' }
      }
    } catch {}
  }
  return null
}

function extractFirstPrompt(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(8192)
    const n = fs.readSync(fd, buf, 0, 8192, 0)
    fs.closeSync(fd)
    const head = buf.toString('utf-8', 0, n)
    const lines = head.split('\n')

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if ((obj.type === 'user' || obj.type === 'human') && obj.message?.role === 'user') {
          const c = obj.message.content
          if (typeof c === 'string') return c.slice(0, 600)
          if (Array.isArray(c)) {
            for (const p of c) {
              if (typeof p === 'string') return p.slice(0, 600)
              if (p?.type === 'text' && typeof p.text === 'string') return p.text.slice(0, 600)
            }
          }
        }
      } catch {}
    }
  } catch {}
  return null
}

function matchToTarget(prompt, targets) {
  if (!prompt || targets.length === 0) return null
  const pLow = prompt.toLowerCase()

  let best = null
  let bestScore = 0

  for (const t of targets) {
    if (!t.description) continue
    const dLow = t.description.toLowerCase()

    const descSnippet = dLow.slice(0, 120)
    const promptSnippet = pLow.slice(0, 200)

    if (promptSnippet.includes(descSnippet) || descSnippet.includes(promptSnippet.slice(0, 80))) {
      const score = Math.min(descSnippet.length, promptSnippet.length)
      if (score > bestScore) { bestScore = score; best = t }
    }
  }

  return best
}

// ── Poll Cycle ─────────────────────────────────────────────────────────────────

let _pollCount = 0

function poll() {
  const s = _state
  if (!s) return
  _pollCount++

  try {
    const files = fs.readdirSync(s.projectDir)
    const parentFile = `${s.parentSessionId}.jsonl`
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && f !== parentFile && !s.staleFiles.has(f))
    const activities = []

    if (_pollCount % 10 === 1) {
      console.log(`[zeus] Subagent watcher poll #${_pollCount}: ${jsonlFiles.length} candidate files, ${s.targets.length} targets, dir: ${s.projectDir}`)
    }

    for (const file of jsonlFiles) {
      const filePath = path.join(s.projectDir, file)

      try {
        const stat = fs.statSync(filePath)

        if (Date.now() - stat.mtimeMs > 10 * 60 * 1000) {
          s.staleFiles.add(file)
          continue
        }

        const prevSize = s.filePositions.get(file) ?? 0
        if (stat.size <= prevSize) continue

        s.filePositions.set(file, stat.size)

        const tail = readFileTail(filePath, 8192)
        const activity = extractLatestActivity(tail)
        if (!activity) continue

        const childSessionId = file.replace('.jsonl', '')

        let matched = s.sessionToAgent.get(file)
        if (!matched) {
          const firstPrompt = extractFirstPrompt(filePath)
          if (firstPrompt) {
            const target = matchToTarget(firstPrompt, s.targets)
            if (target) {
              matched = { name: target.name, taskId: target.taskId }
              s.sessionToAgent.set(file, matched)
              console.log(`[zeus] Subagent watcher: matched ${file} → ${target.name}`)
            }
          }
          if (!matched && s.targets.length > 0) {
            const matchedNames = new Set([...s.sessionToAgent.values()].map(v => v.name))
            const unmatched = s.targets.find(t => !matchedNames.has(t.name))
            if (unmatched) {
              matched = { name: unmatched.name, taskId: unmatched.taskId }
              s.sessionToAgent.set(file, matched)
              console.log(`[zeus] Subagent watcher: loose-matched ${file} → ${unmatched.name}`)
            }
          }
        }

        activities.push({
          matchedName: matched?.name,
          matchedTaskId: matched?.taskId,
          childSessionId,
          latestTool: activity.tool,
          latestStatus: activity.status
        })
      } catch {}
    }

    if (activities.length > 0) {
      _emit('claude-session:subagent-activity', {
        conversationId: s.conversationId,
        activities
      })
    }
  } catch (err) {
    console.error('[zeus] Subagent watcher error:', err)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function startSubagentWatch(conversationId, parentSessionId, workspacePath, targets) {
  stopSubagentWatch()

  const projectDir = findProjectDir(parentSessionId, workspacePath)
  if (!projectDir) {
    console.warn('[zeus] Subagent watcher: project dir not found for', workspacePath)
    return false
  }

  console.log(`[zeus] Subagent watcher started — dir: ${projectDir}, targets: ${targets.map(t => t.name).join(', ')}`)

  _state = {
    conversationId,
    parentSessionId,
    projectDir,
    targets,
    filePositions: new Map(),
    sessionToAgent: new Map(),
    staleFiles: new Set(),
    intervalId: setInterval(poll, 2000)
  }

  setTimeout(poll, 500)
  return true
}

export function updateSubagentTargets(targets) {
  if (_state) {
    _state.targets = targets
  }
}

export function stopSubagentWatch() {
  if (_state) {
    clearInterval(_state.intervalId)
    console.log(`[zeus] Subagent watcher stopped for ${_state.conversationId}`)
    _state = null
  }
}
