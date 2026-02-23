<script lang="ts">
  import { workspaceStore } from "../stores/workspace.svelte.js";
  import { uiStore } from "../stores/ui.svelte.js";

  function openCodeServer() {
    // Dynamically determine code-server base URL based on hostname
    // Production: redirect to subdomain (https://code.intothesavvyverse.us)
    // Development: use localhost (http://localhost:8081)
    const codeServerBase = window.location.hostname.includes('intothesavvyverse.us')
      ? 'https://code.intothesavvyverse.us'
      : 'http://localhost:8081';

    // Construct URL with optional workspace path
    let url = codeServerBase;
    if (workspaceStore.active) {
      const encodedPath = encodeURIComponent(workspaceStore.active.path);
      url = `${codeServerBase}/${encodedPath}`;
    }

    // Open in new tab
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
