<script lang="ts">
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
  import TabBar from './TabBar.svelte'
  import IconSidebar from './icons/IconSidebar.svelte'
  import IconClaude from './icons/IconClaude.svelte'
  import IconPlus from './icons/IconPlus.svelte'
  import IconCode from './icons/IconCode.svelte'
  import IconFolder from './icons/IconFolder.svelte'
  import IconPanelRight from './icons/IconPanelRight.svelte'

  let { onrunClaude, onnewTerminal, onopenIDE, onreveal, ontogglePanel }: {
    onrunClaude: () => void
    onnewTerminal: () => void
    onopenIDE: () => void
    onreveal: () => void
    ontogglePanel: () => void
  } = $props()

  const breadcrumb = $derived(
    workspaceStore.active
      ? workspaceStore.active.path.replace(/^\/Users\/[^/]+/, '~')
      : 'No workspace selected'
  )
</script>

<div class="toolbar">
  <div class="toolbar-left">
    <button class="icon-btn" title="Toggle sidebar (Cmd+B)" onclick={() => uiStore.toggleSidebar()}>
      <IconSidebar size={18} />
    </button>
    <div class="divider"></div>
    <span class="breadcrumb">{breadcrumb}</span>
  </div>

  <div class="toolbar-center">
    <TabBar />
  </div>

  <div class="toolbar-right">
    <button class="action-btn primary" title="Run Claude Code" onclick={onrunClaude}>
      <IconClaude size={16} />
      <span>Claude Code</span>
    </button>
    <button class="icon-btn" title="New terminal (Cmd+T)" onclick={onnewTerminal}>
      <IconPlus size={16} />
    </button>
    <div class="divider"></div>
    <button class="icon-btn" title="Open in IDE" onclick={onopenIDE}>
      <IconCode size={16} />
    </button>
    <button class="icon-btn" title="Reveal in Finder" onclick={onreveal}>
      <IconFolder size={16} />
    </button>
    <div class="divider"></div>
    <button class="icon-btn" title="Toggle panel (Cmd+I)" onclick={ontogglePanel}>
      <IconPanelRight size={16} />
    </button>
  </div>
</div>

<style>
  .toolbar {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: #131313;
    border-bottom: 1px solid #222;
    gap: 12px;
    -webkit-app-region: no-drag;
  }
  .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .toolbar-center { flex: 1; min-width: 0; display: flex; justify-content: center; }

  .divider { width: 1px; height: 20px; background: #222; margin: 0 4px; }

  .breadcrumb {
    font-size: 12px;
    color: #777;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border: none; background: transparent;
    color: #777; border-radius: 6px; cursor: pointer; transition: all 120ms ease;
  }
  .icon-btn:hover { background: #1e1e1e; color: #bbb; }

  .action-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 12px; border: 1px solid #2a2a2a; background: #1a1a1a;
    color: #bbb; border-radius: 6px; cursor: pointer;
    font-size: 12px; font-weight: 500; transition: all 120ms ease;
    font-family: inherit;
  }
  .action-btn:hover { background: #1e1e1e; border-color: #3a3a3a; }
  .action-btn.primary {
    background: rgba(176, 144, 224, 0.12);
    border-color: rgba(176, 144, 224, 0.25);
    color: #b090e0;
  }
  .action-btn.primary:hover {
    background: rgba(176, 144, 224, 0.2);
    border-color: #b090e0;
  }
</style>
