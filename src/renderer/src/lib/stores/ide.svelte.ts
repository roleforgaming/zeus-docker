import type { IDE } from '../types/index.js'

// ── IDE Store (Svelte 5 runes) ─────────────────────────────────────────────────

class IDEStore {
  list = $state<IDE[]>([])

  async load() {
    this.list = await window.zeus.ide.list()
  }

  async open(ideCmd: string, workspacePath: string) {
    return window.zeus.ide.open(ideCmd, workspacePath)
  }
}

export const ideStore = new IDEStore()
