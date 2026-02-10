import type { TerminalSession, TerminalSize } from '../types/index.js'

// ── Terminal Store (Svelte 5 runes) ────────────────────────────────────────────

class TerminalStore {
  sessions = $state<TerminalSession[]>([])
  activeId = $state<number | null>(null)

  activeSession = $derived(
    this.activeId !== null ? this.sessions.find((s) => s.id === this.activeId) ?? null : null
  )

  private _unsubData: (() => void) | null = null
  private _unsubExit: (() => void) | null = null
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null

  /** Start listening for PTY events. Call once on mount. */
  listen() {
    this._unsubData = window.zeus.terminal.onData(() => {
      // xterm write is handled in preload; no-op here
    })
    this._unsubExit = window.zeus.terminal.onExit(({ id }) => {
      // Optionally handle exit
      void id
    })
  }

  /** Stop listening. Call on unmount. */
  unlisten() {
    this._unsubData?.()
    this._unsubExit?.()
  }

  /** Create a new terminal tab. */
  async create(workspacePath?: string, isClaude = false): Promise<number> {
    const { id } = await window.zeus.terminal.create(workspacePath)

    const session: TerminalSession = {
      id,
      isClaude,
      title: isClaude ? 'Claude Code' : `Terminal ${id}`,
      workspacePath
    }

    this.sessions = [...this.sessions, session]
    this.activeId = id

    return id
  }

  /** Attach xterm to a DOM element after it's rendered. */
  attach(termId: number, elementId: string): TerminalSize {
    return window.zeus.terminal.attach(termId, elementId)
  }

  /** Switch visible terminal. */
  switchTo(id: number) {
    this.activeId = id
  }

  /** Close and dispose a terminal session. */
  async close(id: number) {
    await window.zeus.terminal.kill(id)
    this.sessions = this.sessions.filter((s) => s.id !== id)

    if (this.activeId === id) {
      this.activeId = this.sessions.length > 0 ? this.sessions[this.sessions.length - 1].id : null
    }
  }

  /** Fit the active terminal to its container. */
  fitActive(): TerminalSize | null {
    if (this.activeId === null) return null
    return window.zeus.terminal.fit(this.activeId)
  }

  /** Debounced fit. */
  fitActiveDebounced(delay = 50) {
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    this._resizeTimer = setTimeout(() => this.fitActive(), delay)
  }

  /** Focus the active terminal. */
  focusActive() {
    if (this.activeId !== null) window.zeus.terminal.focus(this.activeId)
  }

  /** Clear the active terminal. */
  clearActive() {
    if (this.activeId !== null) window.zeus.terminal.clear(this.activeId)
  }

  /** Write data to PTY (e.g. "claude\n"). */
  writeToPty(id: number, data: string) {
    window.zeus.terminal.writeToPty(id, data)
  }
}

export const terminalStore = new TerminalStore()
