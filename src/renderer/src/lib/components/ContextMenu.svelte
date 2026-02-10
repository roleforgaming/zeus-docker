<script lang="ts">
  import { uiStore } from '../stores/ui.svelte.js'
  import { workspaceStore } from '../stores/workspace.svelte.js'

  let { onaction }: {
    onaction: (action: string, wsPath: string) => void
  } = $props()

  function handle(action: string) {
    if (uiStore.contextMenuTarget) {
      onaction(action, uiStore.contextMenuTarget)
    }
    uiStore.closeContextMenu()
  }
</script>

{#if uiStore.contextMenuOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => uiStore.closeContextMenu()}></div>
  <div class="menu" style="left:{uiStore.contextMenuX}px;top:{uiStore.contextMenuY}px">
    <button class="item" onclick={() => handle('open-terminal')}>Open Terminal Here</button>
    <button class="item" onclick={() => handle('run-claude')}>Run Claude Code</button>
    <div class="divider"></div>
    <button class="item" onclick={() => handle('open-ide')}>Open in IDE</button>
    <button class="item" onclick={() => handle('reveal-finder')}>Reveal in Finder</button>
    <div class="divider"></div>
    <button class="item danger" onclick={() => handle('remove')}>Remove from List</button>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 199; }
  .menu {
    position: fixed; z-index: 200;
    background: #181818; border: 1px solid #252525;
    border-radius: 8px; padding: 4px; min-width: 200px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  .item {
    display: block; width: 100%; padding: 7px 12px;
    border: none; background: transparent; color: #a0a0a0;
    font-size: 13px; text-align: left; cursor: pointer;
    border-radius: 4px; font-family: inherit;
    transition: background 120ms ease;
  }
  .item:hover { background: rgba(155, 111, 212, 0.1); color: #9b6fd4; }
  .item.danger:hover { background: rgba(204, 85, 85, 0.1); color: #c55; }
  .divider { height: 1px; background: #1e1e1e; margin: 4px 8px; }
</style>
