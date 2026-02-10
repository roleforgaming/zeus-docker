<script lang="ts">
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
</script>

<div class="statusbar">
  <div class="left">
    <span class="item">{workspaceStore.active?.name ?? 'No workspace'}</span>
    {#if workspaceStore.activeDirInfo?.hasGit}
      <span class="item">git</span>
    {/if}
  </div>
  <div class="right">
    {#if uiStore.termSize}
      <span class="item">{uiStore.termSize}</span>
    {/if}
  </div>
</div>

<style>
  .statusbar {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: #141414;
    border-top: 1px solid #262626;
    font-size: 11px;
    color: #666;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
  }
  .left, .right { display: flex; align-items: center; gap: 16px; }
  .item { display: flex; align-items: center; gap: 4px; }
</style>
