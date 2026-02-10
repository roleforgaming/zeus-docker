// ── Claude Code Store (Svelte 5 runes) ─────────────────────────────────────────

class ClaudeStore {
  installed = $state(false)
  version = $state<string | null>(null)
  updating = $state(false)

  status = $derived<'installed' | 'not-installed' | 'updating'>(
    this.updating ? 'updating' : this.installed ? 'installed' : 'not-installed'
  )

  async check() {
    this.installed = await window.zeus.claude.isInstalled()
    if (this.installed) {
      this.version = await window.zeus.claude.version()
    } else {
      this.version = null
    }
  }

  async update(): Promise<{ success: boolean; output?: string; error?: string }> {
    this.updating = true
    try {
      const result = await window.zeus.claude.update()
      await this.check()
      return result
    } finally {
      this.updating = false
    }
  }
}

export const claudeStore = new ClaudeStore()
