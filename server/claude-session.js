/**
 * Claude Code sessions — spawned in a PTY for full interactive terminal support.
 */
import os from 'node:os'
import fs from 'node:fs'
import { getClaudeCliPath, getShellEnv } from './claude-cli.js'

let _emit = (event, data) => {}  // Replace _getWindow().webContents.send with this
let _pty
const sessions = new Map()

export function initClaudeSession(ptyModule, emitFn) {
  _pty = ptyModule
  _emit = emitFn
}

export function getSession(id) { return sessions.get(id) }
export function deleteSession(id) { sessions.delete(id) }

export function detectPrompt(text) {
  const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
  if (!clean || clean.length < 5) return null

  const permissionPatterns = [
    /(?:Allow|Approve)\s+(\w+)\(([^)]+)\)\s*\?\s*\(([yYnNaA/\s]+)\)/,
    /(?:Allow|Do you want to allow|Approve)\s+(.+?)\s*\?\s*\(([yYnNaA][^)]*)\)/,
    /(.+?)\s*\(([yYnNaA][/|][yYnNaA](?:[/|][yYnNaA])?)\)\s*$/
  ]

  for (const pattern of permissionPatterns) {
    const m = clean.match(pattern)
    if (!m) continue
    const options = []
    const optStr = (m[3] || m[2] || '').toLowerCase()
    if (optStr.includes('y')) options.push({ label: 'Yes', value: 'y', key: 'y' })
    if (optStr.includes('n')) options.push({ label: 'No', value: 'n', key: 'n' })
    if (optStr.includes('a')) options.push({ label: 'Always allow', value: 'a', key: 'a' })
    if (options.length === 0) continue
    let toolName, toolInput
    if (m[3]) { toolName = m[1]; toolInput = m[2] }
    else {
      const tp = (m[1] || '').match(/(\w+)\((.+)\)/)
      if (tp) { toolName = tp[1]; toolInput = tp[2] }
    }
    return { promptType: 'permission', message: clean, options, toolName, toolInput }
  }

  const numberedLines = clean.match(/^\s*(\d+)[.)]\s+.+$/gm)
  if (numberedLines && numberedLines.length >= 2) {
    const lastLine = numberedLines[numberedLines.length - 1]
    const afterLast = clean.slice(clean.lastIndexOf(lastLine) + lastLine.length).trim()
    if (afterLast.length < 30) {
      const options = []
      for (const line of numberedLines) {
        const m = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
        if (m) options.push({ label: m[2].trim(), value: m[1], key: m[1] })
      }
      if (options.length >= 2 && options.length <= 10) {
        const firstIdx = clean.indexOf(numberedLines[0])
        return { promptType: 'choice', message: firstIdx > 0 ? clean.slice(0, firstIdx).trim() : 'Choose an option', options }
      }
    }
  }

  const ynMatch = clean.match(/(.+?)\s*[\[(]([yYnN][/|][yYnN])[\])]\s*$/)
  if (ynMatch) {
    return { promptType: 'yesno', message: ynMatch[1].trim(), options: [{ label: 'Yes', value: 'y', key: 'y' }, { label: 'No', value: 'n', key: 'n' }] }
  }

  const inputMatch = clean.match(/^\?\s+(.+?):\s*$/)
  if (inputMatch) {
    return { promptType: 'input', message: inputMatch[1].trim(), options: [] }
  }

  return null
}

export function spawnClaudeSession(conversationId, prompt, cwd, model, resumeSessionId) {
  let session = sessions.get(conversationId)
  if (!session) {
    session = { pty: null, sessionId: null, cwd }
    sessions.set(conversationId, session)
  }

  if (resumeSessionId && !session.sessionId) {
    session.sessionId = resumeSessionId
  }

  if (session.pty) {
    try { session.pty.kill() } catch {}
    session.pty = null
  }

  const claudePath = getClaudeCliPath()
  const safePrompt = prompt.startsWith('-') ? '\n' + prompt : prompt
  const args = ['-p', safePrompt, '--output-format', 'stream-json', '--verbose']

  if (model) args.push('--model', model)
  if (session.sessionId) args.push('--resume', session.sessionId, '--continue')

  const effectiveCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir()

  console.log(`[zeus] Spawning Claude PTY session ${conversationId}:`, claudePath, args.map((a, i) => i === 1 ? `"${a.slice(0, 60)}..."` : a).join(' '))
  console.log(`[zeus] CWD: ${effectiveCwd}`)

  const env = { ...getShellEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8' }

  try {
    const ptyProcess = _pty.spawn(claudePath, args, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      cwd: effectiveCwd,
      env
    })

    session.pty = ptyProcess
    console.log(`[zeus] Claude PTY PID: ${ptyProcess.pid}`)

    let buffer = ''
    let nonJsonBuf = ''
    let nonJsonTimer = null

    const flushNonJson = () => {
      if (!nonJsonBuf.trim()) { nonJsonBuf = ''; return }
      const text = nonJsonBuf
      nonJsonBuf = ''

      const prompt = detectPrompt(text)
      if (prompt) {
        console.log(`[zeus] PTY prompt detected: type=${prompt.promptType}, options=${prompt.options.map(o => o.label).join(',')}`)
        _emit('claude-session:event', {
          id: conversationId,
          event: { type: 'prompt', ...prompt, rawText: text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim() }
        })
      } else {
        const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
        if (clean) {
          _emit('claude-session:event', {
            id: conversationId,
            event: { type: 'stderr', text }
          })
        }
      }
    }

    ptyProcess.onData((data) => {
      buffer += data
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '').trim()
        if (!trimmed) continue

        try {
          const event = JSON.parse(trimmed)
          if (nonJsonBuf.trim()) {
            if (nonJsonTimer) { clearTimeout(nonJsonTimer); nonJsonTimer = null }
            flushNonJson()
          }
          if (event.sessionId || event.session_id) {
            session.sessionId = event.sessionId || event.session_id
          }
          _emit('claude-session:event', { id: conversationId, event })
        } catch {
          nonJsonBuf += line + '\n'
          if (nonJsonTimer) clearTimeout(nonJsonTimer)
          nonJsonTimer = setTimeout(flushNonJson, 300)
        }
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[zeus] Claude PTY closed [${conversationId}] exit=${exitCode}`)

      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim())
          if (event.sessionId || event.session_id) {
            session.sessionId = event.sessionId || event.session_id
          }
          _emit('claude-session:event', { id: conversationId, event })
        } catch {
          nonJsonBuf += buffer
          flushNonJson()
        }
      }
      if (nonJsonTimer) { clearTimeout(nonJsonTimer); nonJsonTimer = null }
      flushNonJson()

      session.pty = null

      _emit('claude-session:done', {
        id: conversationId,
        exitCode: exitCode ?? 0,
        sessionId: session.sessionId
      })
    })

    return true
  } catch (err) {
    console.error(`[zeus] Claude PTY spawn error [${conversationId}]:`, err.message)
    _emit('claude-session:event', {
      id: conversationId,
      event: { type: 'error', text: err.message }
    })
    _emit('claude-session:done', {
      id: conversationId,
      exitCode: 1,
      sessionId: session.sessionId
    })
    return false
  }
}

export function respondToSession(conversationId, response) {
  const session = sessions.get(conversationId)
  if (!session?.pty) {
    console.warn(`[zeus] respondToSession: no active PTY for ${conversationId}`)
    return false
  }
  console.log(`[zeus] Responding to PTY [${conversationId}]: "${response}"`)
  session.pty.write(response + '\n')
  return true
}

export function abortSession(conversationId) {
  const session = sessions.get(conversationId)
  if (!session?.pty) return false
  session.pty.write('\x03')
  return true
}

export function killAllClaudeSessions() {
  for (const [, s] of sessions) {
    if (s.pty) {
      try { s.pty.kill() } catch {}
      s.pty = null
    }
  }
  sessions.clear()
}
