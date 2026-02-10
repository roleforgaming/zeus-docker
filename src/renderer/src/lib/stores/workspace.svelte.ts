import type { Workspace, DirInfo } from '../types/index.js'

// ── Workspace Store (Svelte 5 runes) ──────────────────────────────────────────

class WorkspaceStore {
  list = $state<Workspace[]>([])
  active = $state<Workspace | null>(null)
  activeDirInfo = $state<DirInfo | null>(null)

  sorted = $derived(
    [...this.list].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
  )

  async load() {
    this.list = await window.zeus.workspace.list()
  }

  async add(): Promise<Workspace | null> {
    const result = await window.zeus.workspace.add()
    if (!result) return null
    await this.load()
    const ws = this.list.find((w) => w.path === result.path) ?? null
    if (ws) await this.select(ws)
    return ws
  }

  async remove(wsPath: string) {
    await window.zeus.workspace.remove(wsPath)
    if (this.active?.path === wsPath) {
      this.active = null
      this.activeDirInfo = null
    }
    await this.load()
  }

  async select(ws: Workspace, silent = false) {
    this.active = ws
    await window.zeus.workspace.setLast(ws.path)
    this.activeDirInfo = await window.zeus.system.getDirInfo(ws.path)
    // Update lastOpened locally for sort
    const found = this.list.find((w) => w.path === ws.path)
    if (found) found.lastOpened = Date.now()
    return !silent
  }

  async restoreLast() {
    const lastPath = await window.zeus.workspace.getLast()
    if (!lastPath) return
    const ws = this.list.find((w) => w.path === lastPath)
    if (ws) await this.select(ws, true)
  }
}

export const workspaceStore = new WorkspaceStore()
