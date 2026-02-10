// ── UI Store (Svelte 5 runes) ──────────────────────────────────────────────────

export interface Toast {
  message: string
  type: 'info' | 'success' | 'error'
  id: number
}

export type ActiveViewType = 'terminal' | 'doc' | 'claude'

class UIStore {
  sidebarCollapsed = $state(false)
  rightPanelOpen = $state(false)
  ideModalOpen = $state(false)
  updateModalOpen = $state(false)
  toasts = $state<Toast[]>([])
  termSize = $state('')

  /** Which kind of tab is showing in the main content area */
  activeView = $state<ActiveViewType>('terminal')

  // Context menu
  contextMenuOpen = $state(false)
  contextMenuX = $state(0)
  contextMenuY = $state(0)
  contextMenuTarget = $state<string | null>(null)

  private _toastId = 0

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed
  }

  toggleRightPanel() {
    this.rightPanelOpen = !this.rightPanelOpen
  }

  showToast(message: string, type: Toast['type'] = 'info') {
    const id = ++this._toastId
    // Remove previous toast
    this.toasts = [{ message, type, id }]
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    }, 3200)
  }

  openContextMenu(x: number, y: number, target: string) {
    this.contextMenuX = Math.min(x, window.innerWidth - 208)
    this.contextMenuY = Math.min(y, window.innerHeight - 228)
    this.contextMenuTarget = target
    this.contextMenuOpen = true
  }

  closeContextMenu() {
    this.contextMenuOpen = false
    this.contextMenuTarget = null
  }
}

export const uiStore = new UIStore()
