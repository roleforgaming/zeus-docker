<script lang="ts">
  import { uiStore } from '../stores/ui.svelte.js'
  import IconSidebar from './icons/IconSidebar.svelte'
  import IconFolder from './icons/IconFolder.svelte'
  import IconPanelRight from './icons/IconPanelRight.svelte'

  let { onreveal, ontogglePanel }: {
    onreveal: () => void
    ontogglePanel: () => void
  } = $props()
</script>

<div class="toolbar">
  <div class="toolbar-left">
    <button class="icon-btn" title="Toggle sidebar (Cmd+B)" onclick={() => uiStore.toggleSidebar()}>
      <IconSidebar size={18} />
    </button>
  </div>

  <div class="toolbar-right">
    <button class="icon-btn" title="Open in code-server" onclick={() => (uiStore.ideModalOpen = true)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
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
    height: 38px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 12px; background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle);
    -webkit-app-region: no-drag;
  }
  .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 6px; }

  .divider { width: 1px; height: 20px; background: var(--border); margin: 0 4px; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border: none; background: transparent;
    color: var(--text-secondary); border-radius: 6px; cursor: pointer; transition: all 120ms ease;
  }
  .icon-btn:hover { background: var(--border); color: var(--text-primary); }
</style>
