<script lang="ts">
  import { uiStore } from '../stores/ui.svelte.js'
</script>

{#each uiStore.toasts as toast (toast.id)}
  <div class="toast {toast.type}">{toast.message}</div>
{/each}

<style>
  .toast {
    position: fixed; bottom: 48px; right: 20px;
    background: #1f1f1f; border: 1px solid #333; border-radius: 8px;
    padding: 12px 16px; font-size: 13px; color: #e6e6e6;
    z-index: 300; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    max-width: 400px; animation: slideUp 0.3s ease;
  }
  .toast.success { border-left: 3px solid #4ade80; }
  .toast.error { border-left: 3px solid #f87171; }
  .toast.info { border-left: 3px solid #60a5fa; }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
</style>
