<script lang="ts">
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
  // import { ideStore } from '../stores/ide.svelte.js' // Replaced with client-side URL generation

  // Determine if running locally or remotely
  const isLocal = $derived(
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  )

  // Generate code-server URL based on environment
  const codeServerUrl = $derived(
    isLocal ? 'http://localhost:8081' : `${window.location.origin}/code`
  )

  function openCodeServer() {
    if (!workspaceStore.active) {
      uiStore.showToast('No active workspace selected', 'error')
      return
    }

    const wsPath = workspaceStore.active.path
    const folder = encodeURIComponent(wsPath)
    const targetUrl = `${codeServerUrl}?folder=${folder}`

    try {
      window.open(targetUrl, '_blank')
      uiStore.showToast('Opening workspace in code-server...', 'info')
    } catch (err) {
      uiStore.showToast(
        `Failed to open: ${err instanceof Error ? err.message : String(err)}`,
        'error'
      )
    } finally {
      uiStore.ideModalOpen = false
    }
  }
</script>

{#if uiStore.ideModalOpen}
  <div class="modal">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (uiStore.ideModalOpen = false)}></div>
    <div class="content">
      <div class="header">
        <h2>Open in IDE</h2>
        <button class="close" onclick={() => (uiStore.ideModalOpen = false)}>&times;</button>
      </div>
      <div class="body">
        <button class="open-button" onclick={openCodeServer}>
          🚀 Open Workspace in code-server
        </button>
        <p class="info-text">
          {#if isLocal}
            Opening <code>localhost:8081</code>
          {:else}
            Opening <code>{window.location.origin}/code</code>
          {/if}
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .backdrop {
    position: absolute; inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }
  .content {
    position: relative; background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 12px; width: 420px; max-height: 80vh;
    overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
  }
  h2 { font-size: 15px; font-weight: 600; color: var(--text-primary); }
  .close {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border: none; background: transparent;
    color: var(--text-muted); border-radius: 6px; cursor: pointer; font-size: 20px;
  }
  .close:hover { background: var(--border); color: var(--text-primary); }
  .body { padding: 20px; }

  .open-button {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 12px 16px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--border); background: var(--bg-raised);
    color: var(--text-primary); font-size: 14px; font-weight: 600;
    font-family: inherit; transition: all 120ms ease;
  }
  .open-button:hover {
    background: var(--border); border-color: var(--text-primary);
  }
  .open-button:active {
    opacity: 0.8;
  }

  .info-text {
    margin-top: 12px; font-size: 12px; color: var(--text-secondary);
    text-align: center;
  }
  .info-text code {
    background: var(--bg-raised); padding: 2px 6px; border-radius: 4px;
    font-family: var(--font-mono); color: var(--text-primary);
  }
</style>
