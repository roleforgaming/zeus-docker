<script lang="ts">
  import { claudeStore } from '../stores/claude.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'

  let updateResult = $state<{ success: boolean; output?: string; error?: string } | null>(null)
  let running = $state(false)

  async function runUpdate() {
    running = true
    updateResult = null
    const result = await claudeStore.update()
    updateResult = result
    running = false
    if (result.success) {
      uiStore.showToast('Claude Code updated successfully', 'success')
    } else {
      uiStore.showToast('Failed to update Claude Code', 'error')
    }
  }

  // Auto-start update when modal opens
  $effect(() => {
    if (uiStore.updateModalOpen && !running && !updateResult) {
      runUpdate()
    }
  })

  function close() {
    uiStore.updateModalOpen = false
    updateResult = null
  }
</script>

{#if uiStore.updateModalOpen}
  <div class="modal">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={close}></div>
    <div class="content">
      <div class="header">
        <h2>Update Claude Code</h2>
        <button class="close-btn" onclick={close}>&times;</button>
      </div>
      <div class="body">
        {#if running}
          <div class="status-row">
            <div class="spinner"></div>
            <p>Updating Claude Code via npm...</p>
          </div>
        {:else if updateResult?.success}
          <p class="success">Claude Code updated successfully!</p>
          {#if updateResult.output}
            <pre class="output">{updateResult.output}</pre>
          {/if}
        {:else if updateResult}
          <p class="error">Update failed</p>
          <pre class="output">{updateResult.error ?? 'Unknown error'}</pre>
        {/if}
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
    position: relative; background: #181818; border: 1px solid #252525;
    border-radius: 12px; width: 360px; max-height: 80vh;
    overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid #1e1e1e;
  }
  h2 { font-size: 15px; font-weight: 600; color: #a0a0a0; }
  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border: none; background: transparent;
    color: #505050; border-radius: 6px; cursor: pointer; font-size: 20px;
  }
  .close-btn:hover { background: #191919; color: #a0a0a0; }
  .body { padding: 16px 20px; }

  .status-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
  .status-row p { color: #606060; font-size: 13px; }

  .spinner {
    width: 16px; height: 16px; border: 2px solid #252525;
    border-top-color: #9b6fd4; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .success { color: #3a9e64; font-weight: 500; font-size: 13px; }
  .error { color: #c55; font-weight: 500; font-size: 13px; }

  .output {
    margin-top: 8px;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 11px; color: #505050;
    white-space: pre-wrap; max-height: 200px; overflow-y: auto;
    background: #131313; padding: 8px; border-radius: 6px;
  }
</style>
