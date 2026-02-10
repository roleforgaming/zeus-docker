<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { workspaceStore } from './lib/stores/workspace.svelte.js'
  import { terminalStore } from './lib/stores/terminal.svelte.js'
  import { claudeStore } from './lib/stores/claude.svelte.js'
  import { ideStore } from './lib/stores/ide.svelte.js'
  import { uiStore } from './lib/stores/ui.svelte.js'

  import Sidebar from './lib/components/Sidebar.svelte'
  import Toolbar from './lib/components/Toolbar.svelte'
  import TerminalArea from './lib/components/TerminalArea.svelte'
  import WelcomeScreen from './lib/components/WelcomeScreen.svelte'
  import StatusBar from './lib/components/StatusBar.svelte'
  import IDEModal from './lib/components/IDEModal.svelte'
  import UpdateModal from './lib/components/UpdateModal.svelte'
  import ContextMenu from './lib/components/ContextMenu.svelte'
  import Toast from './lib/components/Toast.svelte'

  const hasTerminals = $derived(terminalStore.sessions.length > 0)

  // Unsub array for menu actions
  let unsubs: Array<() => void> = []

  onMount(async () => {
    // Bootstrap stores
    await Promise.all([
      workspaceStore.load(),
      claudeStore.check(),
      ideStore.load()
    ])

    await workspaceStore.restoreLast()

    // Listen for PTY events
    terminalStore.listen()

    // Menu actions from main process
    unsubs.push(
      window.zeus.onAction('new-terminal', () => newTerminal()),
      window.zeus.onAction('run-claude', () => runClaude()),
      window.zeus.onAction('clear-terminal', () => terminalStore.clearActive())
    )
  })

  onDestroy(() => {
    terminalStore.unlisten()
    unsubs.forEach((fn) => fn())
  })

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function newTerminal(wsPath?: string) {
    const cwd = wsPath ?? workspaceStore.active?.path
    const id = await terminalStore.create(cwd)
    // Wait for Svelte to render the terminal wrapper div
    await tick()
    const size = terminalStore.attach(id, `terminal-${id}`)
    uiStore.termSize = `${size.cols}x${size.rows}`
  }

  async function runClaude(wsPath?: string) {
    if (!claudeStore.installed) {
      uiStore.showToast('Claude Code not installed. Run: npm install -g @anthropic-ai/claude-code', 'error')
      return
    }
    const cwd = wsPath ?? workspaceStore.active?.path
    if (!cwd) {
      const ws = await workspaceStore.add()
      if (!ws) return
      await launchClaudeInWorkspace(ws.path)
      return
    }
    await launchClaudeInWorkspace(cwd)
  }

  async function launchClaudeInWorkspace(cwd: string) {
    const id = await terminalStore.create(cwd, true)
    await tick()
    const size = terminalStore.attach(id, `terminal-${id}`)
    uiStore.termSize = `${size.cols}x${size.rows}`
    setTimeout(() => terminalStore.writeToPty(id, 'claude\n'), 600)
  }

  function openIDE() {
    if (!workspaceStore.active) {
      uiStore.showToast('Please select a workspace first', 'error')
      return
    }
    uiStore.ideModalOpen = true
  }

  function revealInFinder() {
    if (workspaceStore.active) {
      window.zeus.system.revealInFinder(workspaceStore.active.path)
    } else {
      uiStore.showToast('No workspace selected', 'error')
    }
  }

  function handleContextAction(action: string, wsPath: string) {
    const ws = workspaceStore.list.find((w) => w.path === wsPath)
    switch (action) {
      case 'open-terminal':
        if (ws) { workspaceStore.select(ws, true); newTerminal(ws.path) }
        break
      case 'run-claude':
        if (ws) { workspaceStore.select(ws, true); runClaude(ws.path) }
        break
      case 'open-ide':
        if (ws) { workspaceStore.select(ws, true); openIDE() }
        break
      case 'reveal-finder':
        window.zeus.system.revealInFinder(wsPath)
        break
      case 'remove':
        workspaceStore.remove(wsPath)
        break
    }
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key === 'b') { e.preventDefault(); uiStore.toggleSidebar(); terminalStore.fitActiveDebounced(250) }
    if (meta && e.key === 'k') { e.preventDefault(); terminalStore.clearActive() }
    if (e.key === 'Escape') { uiStore.ideModalOpen = false; uiStore.updateModalOpen = false; uiStore.closeContextMenu() }
  }

  // Svelte 5 doesn't have `tick` in runes mode from $app — use microtask
  function tick(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Title bar (macOS traffic light drag region) -->
<div class="titlebar">
  <span class="titlebar-text">Zeus</span>
</div>

<!-- Main layout -->
<div class="app">
  <Sidebar onupdate={() => (uiStore.updateModalOpen = true)} />

  <main class="main-content">
    <Toolbar
      onrunClaude={() => runClaude()}
      onnewTerminal={() => newTerminal()}
      onopenIDE={openIDE}
      onreveal={revealInFinder}
    />

    <div class="terminal-region">
      {#if !hasTerminals}
        <WelcomeScreen
          onaddWorkspace={() => workspaceStore.add()}
          onrunClaude={() => runClaude()}
        />
      {/if}
      <TerminalArea />
    </div>

    <StatusBar />
  </main>
</div>

<!-- Overlays -->
<IDEModal />
<UpdateModal />
<ContextMenu onaction={handleContextAction} />
<Toast />

<style>
  :global(*), :global(*::before), :global(*::after) {
    margin: 0; padding: 0; box-sizing: border-box;
  }
  :global(html), :global(body) {
    height: 100%;
    overflow: hidden;
    background: #0d0d0d;
    color: #e6e6e6;
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Noto Sans KR', 'Segoe UI', Inter, Roboto, sans-serif;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }
  :global(::-webkit-scrollbar) { width: 6px; height: 6px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: #333; border-radius: 3px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: #444; }

  .titlebar {
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d0d;
    border-bottom: 1px solid #262626;
    -webkit-app-region: drag;
  }
  .titlebar-text {
    font-size: 13px;
    font-weight: 500;
    color: #999;
    pointer-events: none;
  }

  .app {
    display: flex;
    height: calc(100vh - 52px);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #0d0d0d;
  }

  .terminal-region {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
</style>
