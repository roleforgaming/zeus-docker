<script lang="ts">
  import type { Workspace } from '../types/index.js'

  let { workspace, isActive, onselect, oncontextmenu, ondblclick }: {
    workspace: Workspace
    isActive: boolean
    onselect: () => void
    oncontextmenu: (e: MouseEvent) => void
    ondblclick: () => void
  } = $props()

  const initial = $derived(workspace.name.charAt(0))
  const shortPath = $derived(workspace.path.replace(/^\/Users\/[^/]+/, '~'))
</script>

<button
  class="workspace-item"
  class:active={isActive}
  onclick={onselect}
  oncontextmenu={oncontextmenu}
  ondblclick={ondblclick}
>
  <div class="workspace-icon" class:active={isActive}>{initial}</div>
  <div class="workspace-details">
    <div class="workspace-name">{workspace.name}</div>
    <div class="workspace-path">{shortPath}</div>
  </div>
</button>

<style>
  .workspace-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 120ms ease;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    color: inherit;
    font-family: inherit;
  }
  .workspace-item:hover { background: #222; }
  .workspace-item.active { background: rgba(192, 132, 252, 0.15); }
  .workspace-item.active .workspace-name { color: #c084fc; }

  .workspace-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #999;
    font-size: 14px;
    font-weight: 600;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    text-transform: uppercase;
  }
  .workspace-icon.active { background: rgba(192, 132, 252, 0.08); color: #c084fc; }

  .workspace-details { flex: 1; min-width: 0; }

  .workspace-name {
    font-size: 13px;
    font-weight: 500;
    color: #e6e6e6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .workspace-path {
    font-size: 11px;
    color: #666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
  }
</style>
