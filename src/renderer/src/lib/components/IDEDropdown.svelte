<script lang="ts">
  import { workspaceStore } from "../stores/workspace.svelte.js";
  import { uiStore } from "../stores/ui.svelte.js";

  function openCodeServer() {
    // 1. Determine hostname
    const hostname = window.location.hostname;
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1';

    // 2. Construct URL
    // If Local: use fixed port 8081
    // If Proxy: use current origin + /code
    const baseUrl = isLocal
      ? 'http://localhost:8081'
      : `${window.location.origin}/code`;

    // 3. Append workspace folder parameter if available
    let url = baseUrl;
    if (workspaceStore.active) {
      const folder = encodeURIComponent(workspaceStore.active.path);
      url = `${baseUrl}?folder=${folder}`;
    }

    // 4. Open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<button
  type="button"
  class="ide-trigger"
  onclick={openCodeServer}
  title="Open in code-server"
>
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    ><polyline points="16 18 22 12 16 6" /><polyline
      points="8 6 2 12 8 18"
    /></svg
  >
</button>

<style>
  .ide-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .ide-trigger:hover {
    background: var(--border);
    color: var(--text-primary);
  }
  .ide-trigger:active {
    opacity: 0.8;
  }
</style>
