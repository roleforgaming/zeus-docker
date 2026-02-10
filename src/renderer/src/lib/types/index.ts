// ── Workspace ──────────────────────────────────────────────────────────────────
export interface Workspace {
  path: string
  name: string
  addedAt: number
  lastOpened: number
}

export interface DirInfo {
  name: string
  path: string
  hasGit: boolean
  hasPackageJson: boolean
  packageName: string | null
}

// ── Terminal ───────────────────────────────────────────────────────────────────
export interface TerminalSession {
  id: number
  isClaude: boolean
  title: string
  workspacePath: string | undefined
}

export interface TerminalSize {
  cols: number
  rows: number
}

export interface TerminalCreateResult {
  id: number
  cwd: string
}

// ── IDE ────────────────────────────────────────────────────────────────────────
export interface IDE {
  id: string
  name: string
  cmd: string
  icon: string
}

// ── Claude ─────────────────────────────────────────────────────────────────────
export interface ClaudeUpdateResult {
  success: boolean
  output?: string
  error?: string
}

// ── Store ──────────────────────────────────────────────────────────────────────
export interface AppStore {
  workspaces: Workspace[]
  lastWorkspace: string | null
  idePreference: string
  windowBounds: { x?: number; y?: number; width: number; height: number } | null
}

// ── Preload API (exposed via contextBridge) ────────────────────────────────────
export interface ZeusAPI {
  workspace: {
    list(): Promise<Workspace[]>
    add(): Promise<{ path: string; name: string } | null>
    remove(wsPath: string): Promise<boolean>
    setLast(wsPath: string): Promise<boolean>
    getLast(): Promise<string | null>
  }
  terminal: {
    create(workspacePath?: string): Promise<TerminalCreateResult>
    attach(termId: number, elementId: string): TerminalSize
    writeToPty(termId: number, data: string): void
    focus(termId: number): void
    fit(termId: number): TerminalSize | null
    clear(termId: number): void
    getSize(termId: number): TerminalSize | null
    kill(termId: number): Promise<boolean>
    onData(callback: (payload: { id: number; data: string }) => void): () => void
    onExit(callback: (payload: { id: number; exitCode: number }) => void): () => void
  }
  claude: {
    isInstalled(): Promise<boolean>
    version(): Promise<string | null>
    update(): Promise<ClaudeUpdateResult>
  }
  ide: {
    list(): Promise<IDE[]>
    open(ideCmd: string, workspacePath: string): Promise<{ success: boolean; error?: string }>
    getPreference(): Promise<string>
    setPreference(ideId: string): Promise<boolean>
  }
  system: {
    openExternal(url: string): Promise<void>
    revealInFinder(filePath: string): Promise<void>
    getHome(): Promise<string>
    pathExists(p: string): Promise<boolean>
    getDirInfo(dirPath: string): Promise<DirInfo | null>
  }
  onAction(action: string, callback: () => void): () => void
  xtermCssPath: string
}

// Augment window
declare global {
  interface Window {
    zeus: ZeusAPI
  }
}
