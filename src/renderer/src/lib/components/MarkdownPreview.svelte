<script lang="ts">
  import { markdownStore } from '../stores/markdown.svelte.js'
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import type { MarkdownFile } from '../types/index.js'

  // Reload file list when workspace changes
  $effect(() => {
    const ws = workspaceStore.active
    if (ws) {
      markdownStore.loadFiles(ws.path)
    } else {
      markdownStore.reset()
    }
  })

  /** Track collapsed folders */
  let collapsed = $state<Set<string>>(new Set())

  function toggleFolder(dir: string) {
    const next = new Set(collapsed)
    if (next.has(dir)) next.delete(dir)
    else next.add(dir)
    collapsed = next
  }

  function openFile(file: MarkdownFile) {
    markdownStore.openFile(file)
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /** Short display name for a directory */
  function dirLabel(dir: string): string {
    if (dir === '.') return 'Root'
    return dir
  }

  const totalCount = $derived(markdownStore.files.length)
  const groupCount = $derived(markdownStore.groupedFiles.size)
</script>

<div class="docs-browser">
  <div class="browser-header">
    <span class="header-title">Documents</span>
    {#if totalCount > 0}
      <span class="header-count">{totalCount}</span>
    {/if}
  </div>

  {#if !workspaceStore.active}
    <div class="empty">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <p>Select a workspace to browse docs.</p>
    </div>
  {:else if markdownStore.loading}
    <div class="loading"><div class="spinner"></div></div>
  {:else if totalCount === 0}
    <div class="empty">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>No markdown files found.</p>
    </div>
  {:else}
    <div class="file-tree">
      {#each [...markdownStore.groupedFiles] as [dir, files] (dir)}
        <!-- Folder group -->
        <div class="folder-group">
          <button class="folder-header" onclick={() => toggleFolder(dir)}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2"
              class="chevron"
              class:open={!collapsed.has(dir)}
            ><polyline points="9 18 15 12 9 6"/></svg>

            {#if dir === '.'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon root"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {/if}

            <span class="folder-name">{dirLabel(dir)}</span>
            <span class="folder-count">{files.length}</span>
          </button>

          {#if !collapsed.has(dir)}
            <div class="folder-files">
              {#each files as file (file.path)}
                <button
                  class="file-item"
                  class:active={file.path === markdownStore.activeDocId}
                  onclick={() => openFile(file)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="file-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span class="file-name">{file.name}</span>
                  <span class="file-size">{formatSize(file.size)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .docs-browser { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .browser-header {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 12px 8px; flex-shrink: 0;
  }
  .header-title {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #666;
  }
  .header-count {
    font-size: 9px; background: #262626; color: #999;
    padding: 1px 5px; border-radius: 8px; font-weight: 500;
  }

  /* ── Loading / Empty ── */
  .loading { display: flex; justify-content: center; padding: 32px; }
  .spinner {
    width: 20px; height: 20px; border: 2px solid #333;
    border-top-color: #c084fc; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty {
    display: flex; flex-direction: column; align-items: center;
    padding: 32px 16px; color: #666; text-align: center; gap: 10px;
  }
  .empty-icon { opacity: 0.4; }
  .empty p { font-size: 12px; margin: 0; }

  /* ── File tree ── */
  .file-tree { flex: 1; overflow-y: auto; padding: 0 6px 8px; }

  .folder-group { margin-bottom: 2px; }

  .folder-header {
    display: flex; align-items: center; gap: 6px;
    width: 100%; padding: 6px 8px; border: none;
    background: transparent; color: #999; cursor: pointer;
    border-radius: 4px; font-size: 12px; font-weight: 500;
    font-family: inherit; transition: all 100ms ease;
  }
  .folder-header:hover { background: #1a1a1a; color: #e6e6e6; }

  .chevron {
    transition: transform 150ms ease; flex-shrink: 0;
  }
  .chevron.open { transform: rotate(90deg); }

  .folder-icon { color: #fbbf24; flex-shrink: 0; }
  .folder-icon.root { color: #60a5fa; }
  .folder-name { flex: 1; text-align: left; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder-count {
    font-size: 10px; color: #555; background: #1a1a1a;
    padding: 0 5px; border-radius: 6px;
  }

  .folder-files { padding-left: 12px; }

  .file-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 5px 8px; border: none;
    background: transparent; color: inherit; cursor: pointer;
    border-radius: 4px; font-size: 12px; font-family: inherit;
    text-align: left; transition: all 100ms ease;
  }
  .file-item:hover { background: #1a1a1a; }
  .file-item.active { background: rgba(192, 132, 252, 0.1); color: #e6e6e6; }

  .file-icon { color: #60a5fa; flex-shrink: 0; }
  .file-name {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: #ccc;
  }
  .file-item.active .file-name { color: #e6e6e6; }
  .file-size { font-size: 10px; color: #555; flex-shrink: 0; }
</style>
