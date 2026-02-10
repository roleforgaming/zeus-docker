<script lang="ts">
  import { uiStore } from '../stores/ui.svelte.js'
</script>

{#each uiStore.toasts as toast (toast.id)}
  <div class="toast {toast.type}">{toast.message}</div>
{/each}

<style>
  .toast {
    position: fixed; bottom: 48px; right: 20px;
    background: #181818; border: 1px solid #252525; border-radius: 8px;
    padding: 12px 16px; font-size: 13px; color: #a0a0a0;
    z-index: 300; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
    max-width: 400px; animation: slideUp 0.3s ease;
  }
  .toast.success { border-left: 3px solid #3a9e64; }
  .toast.error { border-left: 3px solid #c55; }
  .toast.info { border-left: 3px solid #4a85c4; }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
</style>
