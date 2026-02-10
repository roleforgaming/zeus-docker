<script lang="ts">
  import { terminalStore } from '../stores/terminal.svelte.js'
  import { claudeSessionStore } from '../stores/claude-session.svelte.js'
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
  import IconBolt from './icons/IconBolt.svelte'
  import IconTerminal from './icons/IconTerminal.svelte'

  let inputEl: HTMLTextAreaElement
  let inputValue = $state('')

  /** Determine which mode we're in based on active view */
  const isClaudeMode = $derived(uiStore.activeView === 'claude')
  const terminalSession = $derived(terminalStore.activeSession)
  const claudeConv = $derived(claudeSessionStore.activeConversation)

  /** Something is active (either terminal or claude conversation) */
  const hasActiveTarget = $derived(
    isClaudeMode ? !!claudeConv : !!terminalSession
  )

  /** Whether claude is currently streaming (disable input) */
  const isStreaming = $derived(claudeConv?.isStreaming ?? false)

  /** Focus input when active session changes */
  $effect(() => {
    const _ = isClaudeMode ? claudeConv?.id : terminalSession?.id
    void _
    if (hasActiveTarget && inputEl) {
      requestAnimationFrame(() => inputEl?.focus())
    }
  })

  function send() {
    if (!inputValue.trim()) return

    if (isClaudeMode && claudeConv) {
      if (isStreaming) return // don't send while streaming
      claudeSessionStore.send(claudeConv.id, inputValue)
      inputValue = ''
      resetHeight()
    } else if (terminalSession) {
      terminalStore.sendInput(terminalSession.id, inputValue)
      inputValue = ''
      resetHeight()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!hasActiveTarget) return

    // Enter = send (Shift+Enter = new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
      return
    }

    // Ctrl+C = interrupt (abort for claude, SIGINT for terminal)
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      if (isClaudeMode && claudeConv) {
        claudeSessionStore.abort(claudeConv.id)
      } else if (terminalSession) {
        terminalStore.sendRaw(terminalSession.id, '\x03')
      }
      inputValue = ''
      resetHeight()
      return
    }

    // Ctrl+D = send EOF (terminal only)
    if (e.key === 'd' && e.ctrlKey && !isClaudeMode && terminalSession) {
      e.preventDefault()
      terminalStore.sendRaw(terminalSession.id, '\x04')
      return
    }

    // Arrow Up/Down = history (terminal only)
    if (!isClaudeMode && terminalSession) {
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const prev = terminalStore.historyUp(terminalSession.id)
        if (prev !== null) {
          e.preventDefault()
          inputValue = prev
          requestAnimationFrame(() => {
            if (inputEl) inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length
          })
        }
        return
      }

      if (e.key === 'ArrowDown' && !e.shiftKey) {
        const next = terminalStore.historyDown(terminalSession.id)
        if (next !== null) {
          e.preventDefault()
          inputValue = next
          requestAnimationFrame(() => {
            if (inputEl) inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length
          })
        }
        return
      }

      // Tab = send tab character (terminal only)
      if (e.key === 'Tab') {
        e.preventDefault()
        terminalStore.sendRaw(terminalSession.id, '\t')
        return
      }
    }
  }

  /** Auto-resize textarea */
  function handleInput() {
    if (!inputEl) return
    inputEl.style.height = 'auto'
    const maxH = 150
    inputEl.style.height = Math.min(inputEl.scrollHeight, maxH) + 'px'
  }

  function resetHeight() {
    if (!inputEl) return
    inputEl.style.height = 'auto'
  }

  /** Expose focus method for parent */
  export function focus() {
    inputEl?.focus()
  }
</script>

<div class="input-bar" class:claude={isClaudeMode}>
  <div class="input-row">
    <!-- Mode indicator -->
    <div class="mode-icon" class:claude={isClaudeMode}>
      {#if isClaudeMode}
        <IconBolt size={16} />
      {:else}
        <IconTerminal size={16} />
      {/if}
    </div>

    <!-- Prompt indicator -->
    <span class="prompt">{isClaudeMode ? '>' : '$'}</span>

    <!-- Text input -->
    <textarea
      bind:this={inputEl}
      bind:value={inputValue}
      class="input-field"
      placeholder={isClaudeMode
        ? (isStreaming ? 'Claude is responding…' : 'Ask Claude...')
        : 'Enter command...'}
      rows="1"
      oninput={handleInput}
      onkeydown={handleKeydown}
      spellcheck="false"
      autocomplete="off"
      disabled={isStreaming}
    ></textarea>

    <!-- Send button -->
    <button
      class="send-btn"
      class:active={inputValue.trim().length > 0 && !isStreaming}
      onclick={send}
      disabled={!inputValue.trim() || isStreaming}
      title="Send (Enter)"
    >
      {#if isStreaming}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      {/if}
    </button>
  </div>

  <!-- Hint bar -->
  <div class="hints">
    <span class="hint"><kbd>Enter</kbd> send</span>
    <span class="hint"><kbd>Shift+Enter</kbd> newline</span>
    {#if !isClaudeMode}
      <span class="hint"><kbd>↑↓</kbd> history</span>
    {/if}
    <span class="hint"><kbd>Ctrl+C</kbd> {isClaudeMode ? 'abort' : 'interrupt'}</span>
    {#if workspaceStore.active}
      <span class="hint ws">{workspaceStore.active.name}</span>
    {/if}
  </div>
</div>

<style>
  .input-bar {
    flex-shrink: 0;
    border-top: 1px solid #313244;
    background: #181825;
    padding: 12px 16px 8px;
  }

  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 12px;
    padding: 10px 12px;
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .input-row:focus-within {
    border-color: #585b70;
    box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.1);
  }
  .input-bar.claude .input-row:focus-within {
    border-color: #cba6f7;
    box-shadow: 0 0 0 2px rgba(203, 166, 247, 0.12);
  }

  .mode-icon {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 8px;
    background: #313244; color: #a6adc8; flex-shrink: 0;
  }
  .mode-icon.claude {
    background: rgba(203, 166, 247, 0.15); color: #cba6f7;
  }

  .prompt {
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 14px; font-weight: 600;
    color: #585b70; flex-shrink: 0; line-height: 28px;
    user-select: none;
  }
  .input-bar.claude .prompt { color: #cba6f7; }

  .input-field {
    flex: 1; min-width: 0;
    background: transparent; border: none; outline: none;
    color: #cdd6f4; font-size: 14px; line-height: 1.5;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
    resize: none; overflow-y: auto;
    max-height: 150px;
    scrollbar-width: thin;
  }
  .input-field::placeholder { color: #585b70; }
  .input-field::-webkit-scrollbar { width: 4px; }
  .input-field::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }

  .send-btn {
    width: 32px; height: 32px; border: none; border-radius: 8px;
    background: #313244; color: #585b70; cursor: default;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 150ms ease;
  }
  .send-btn.active {
    background: #89b4fa; color: #1e1e2e; cursor: pointer;
  }
  .send-btn.active:hover { background: #b4d0fb; }
  .input-bar.claude .send-btn.active {
    background: #cba6f7; color: #1e1e2e;
  }
  .input-bar.claude .send-btn.active:hover { background: #dbbff8; }

  /* ── Hints ── */
  .hints {
    display: flex; align-items: center; gap: 12px;
    padding: 6px 4px 0; flex-wrap: wrap;
  }
  .hint {
    font-size: 10px; color: #45475a;
  }
  .hint kbd {
    font-family: 'D2Coding', 'JetBrains Mono', monospace;
    font-size: 10px; color: #585b70;
    background: #1e1e2e; padding: 1px 4px; border-radius: 3px;
    border: 1px solid #313244;
  }
  .hint.ws {
    margin-left: auto;
    color: #585b70;
    font-family: 'D2Coding', 'JetBrains Mono', monospace;
  }
</style>
