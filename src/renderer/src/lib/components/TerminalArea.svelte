<script lang="ts">
  import { onMount } from 'svelte'
  import { terminalStore } from '../stores/terminal.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'

  let containerEl: HTMLDivElement

  // Resize observer — refit terminal when container size changes
  onMount(() => {
    const observer = new ResizeObserver(() => {
      terminalStore.fitActiveDebounced(50)
    })
    observer.observe(containerEl)
    return () => observer.disconnect()
  })

  // When activeId changes, fit and focus after DOM update
  $effect(() => {
    const id = terminalStore.activeId
    if (id !== null) {
      // Wait a tick for DOM to update visibility
      requestAnimationFrame(() => {
        const size = terminalStore.fitActive()
        terminalStore.focusActive()
        if (size) uiStore.termSize = `${size.cols}x${size.rows}`
      })
    }
  })
</script>

<div class="terminal-area" bind:this={containerEl}>
  {#each terminalStore.sessions as session (session.id)}
    <div
      class="terminal-wrapper"
      class:active={session.id === terminalStore.activeId}
      id="terminal-{session.id}"
    ></div>
  {/each}
</div>

<style>
  .terminal-area {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #0d0d0d;
  }
  .terminal-wrapper {
    position: absolute;
    inset: 0;
    display: none;
    padding: 4px 0 0 4px;
  }
  .terminal-wrapper.active { display: block; }

  .terminal-wrapper :global(.xterm) {
    height: 100%;
    padding: 4px 8px;
  }
</style>
