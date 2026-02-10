<script lang="ts">
  import IconClaude from './icons/IconClaude.svelte'
  import IconFolder from './icons/IconFolder.svelte'
  import IconPlay from './icons/IconPlay.svelte'

  let { onaddWorkspace, onrunClaude }: {
    onaddWorkspace: () => void
    onrunClaude: () => void
  } = $props()
</script>

<div class="welcome">
  <div class="content">
    <div class="icon"><IconClaude size={64} /></div>
    <h1>Welcome to Zeus</h1>
    <p class="subtitle">Your command center for Claude Code</p>

    <div class="actions">
      <button class="btn primary" onclick={onaddWorkspace}>
        <IconFolder size={18} />
        <span>Add Workspace</span>
      </button>
      <button class="btn" onclick={onrunClaude}>
        <IconPlay size={18} />
        <span>Launch Claude Code</span>
      </button>
    </div>

    <div class="shortcuts">
      <div class="shortcut"><kbd>Cmd+T</kbd> New terminal</div>
      <div class="shortcut"><kbd>Cmd+Shift+C</kbd> Run Claude Code</div>
      <div class="shortcut"><kbd>Cmd+B</kbd> Toggle sidebar</div>
      <div class="shortcut"><kbd>Cmd+I</kbd> Skills / MCP / Docs</div>
      <div class="shortcut"><kbd>Cmd+K</kbd> Clear terminal</div>
    </div>
  </div>
</div>

<style>
  .welcome {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d0d;
  }
  .content { text-align: center; max-width: 480px; }
  .icon { color: #9b6fd4; margin-bottom: 20px; opacity: 0.6; }
  h1 { font-size: 28px; font-weight: 600; color: #a0a0a0; margin-bottom: 8px; letter-spacing: -0.02em; }
  .subtitle { font-size: 15px; color: #606060; margin-bottom: 32px; }

  .actions { display: flex; gap: 12px; justify-content: center; margin-bottom: 36px; }

  .btn {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px; border: 1px solid #252525; background: #161616;
    color: #a0a0a0; border-radius: 8px; cursor: pointer;
    font-size: 14px; font-weight: 500; transition: all 120ms ease;
    font-family: inherit;
  }
  .btn:hover { background: #191919; border-color: #333; transform: translateY(-1px); }
  .btn.primary {
    background: rgba(155, 111, 212, 0.1);
    border-color: rgba(155, 111, 212, 0.2);
    color: #9b6fd4;
  }
  .btn.primary:hover {
    background: rgba(155, 111, 212, 0.18);
    border-color: #9b6fd4;
  }

  .shortcuts { display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: center; }
  .shortcut { font-size: 12px; color: #505050; display: flex; align-items: center; gap: 6px; }
  kbd {
    display: inline-block; padding: 2px 6px; font-size: 11px;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    color: #606060; background: #161616; border: 1px solid #252525;
    border-radius: 4px; line-height: 1.4;
  }
</style>
