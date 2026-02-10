<script lang="ts">
  import { terminalStore } from '../stores/terminal.svelte.js'
  import IconBolt from './icons/IconBolt.svelte'
  import IconTerminal from './icons/IconTerminal.svelte'
</script>

<div class="tab-bar">
  {#each terminalStore.sessions as session (session.id)}
    <div class="tab" class:active={session.id === terminalStore.activeId}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div class="tab-body" onclick={() => terminalStore.switchTo(session.id)}>
        <span class="tab-icon" class:claude={session.isClaude}>
          {#if session.isClaude}
            <IconBolt size={14} />
          {:else}
            <IconTerminal size={14} />
          {/if}
        </span>
        <span class="tab-title">{session.title}</span>
      </div>
      <button
        class="tab-close"
        onclick={(e) => { e.stopPropagation(); terminalStore.close(session.id) }}
      >&times;</button>
    </div>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    overflow-x: auto;
    padding: 0 4px;
  }
  .tab-bar::-webkit-scrollbar { height: 0; }

  .tab {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px 5px 12px;
    border-radius: 6px;
    white-space: nowrap;
    font-size: 12px;
    color: #999;
    transition: all 120ms ease;
    border: 1px solid transparent;
    background: transparent;
  }
  .tab:hover { background: #222; color: #e6e6e6; }
  .tab.active { background: #1a1a1a; color: #e6e6e6; border-color: #262626; }

  .tab-body {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .tab-icon { display: flex; align-items: center; }
  .tab-icon.claude { color: #c084fc; }

  .tab-title { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: #666;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0;
  }
  .tab-close:hover { background: #2a2a2a; color: #e6e6e6; }
</style>
