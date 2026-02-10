<script lang="ts">
  import { tick } from 'svelte'
  import { marked } from 'marked'
  import { claudeSessionStore } from '../stores/claude-session.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
  import InputBar from './InputBar.svelte'
  import type { ClaudeMessage, ContentBlock } from '../types/index.js'

  let scrollEl: HTMLDivElement
  let inputBarRef = $state<InputBar | undefined>(undefined)

  const conv = $derived(claudeSessionStore.activeConversation)

  // Focus input bar when switching to this view
  $effect(() => {
    if (conv && uiStore.activeView === 'claude') {
      tick().then(() => inputBarRef?.focus())
    }
  })

  // Auto-scroll to bottom when new content arrives
  $effect(() => {
    // Track changes to trigger scroll
    const _ = conv?.messages.length
    const __ = conv?.streamingContent
    void _
    void __
    tick().then(() => {
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
    })
  })

  function renderMarkdown(text: string): string {
    try {
      return marked.parse(text, { async: false }) as string
    } catch {
      return `<p>${text}</p>`
    }
  }

  function formatToolName(name: string): string {
    // Convert snake_case to readable: "Edit" "Read" "Bash" etc.
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function formatToolInput(input: Record<string, unknown>): string {
    if (input.command) return String(input.command)
    if (input.file_path) return String(input.file_path)
    if (input.query) return String(input.query)
    const keys = Object.keys(input)
    if (keys.length === 0) return ''
    return keys.map((k) => `${k}: ${JSON.stringify(input[k]).slice(0, 60)}`).join(', ')
  }

  function renderBlocks(blocks: ContentBlock[]): string {
    const parts: string[] = []
    for (const block of blocks) {
      switch (block.type) {
        case 'text':
          if (block.text) parts.push(block.text)
          break
        case 'tool_use':
          parts.push(`\n🔧 **${formatToolName(block.name ?? 'Tool')}**${block.input ? ` \`${formatToolInput(block.input)}\`` : ''}\n`)
          break
        case 'tool_result':
          if (block.content) {
            const content = block.content.length > 500 ? block.content.slice(0, 500) + '…' : block.content
            parts.push(`\n<details><summary>Result</summary>\n\n\`\`\`\n${content}\n\`\`\`\n</details>\n`)
          }
          break
        case 'thinking':
          if (block.thinking) {
            const text = block.thinking.length > 200 ? block.thinking.slice(0, 200) + '…' : block.thinking
            parts.push(`\n<details><summary>💭 Thinking</summary>\n\n${text}\n</details>\n`)
          }
          break
      }
    }
    return parts.join('\n')
  }
</script>

{#if conv}
  <div class="conversation-view" class:hidden={uiStore.activeView !== 'claude'}>
    <div class="messages-scroll" bind:this={scrollEl}>
      <div class="messages-container">
        <!-- Welcome header -->
        {#if conv.messages.length === 0 && !conv.isStreaming}
          <div class="welcome">
            <div class="welcome-icon">⚡</div>
            <h2>Claude Code</h2>
            <p>Ask Claude to help with your codebase. Type a message below to start.</p>
          </div>
        {/if}

        <!-- Message list -->
        {#each conv.messages as message (message.id)}
          <div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
            <div class="message-header">
              <span class="message-role">
                {#if message.role === 'user'}
                  <span class="role-icon user-icon">You</span>
                {:else}
                  <span class="role-icon assistant-icon">⚡ Claude</span>
                {/if}
              </span>
              <span class="message-time">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div class="message-body">
              {#if message.role === 'user'}
                <div class="user-text">{message.content}</div>
              {:else if message.blocks && message.blocks.length > 0}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <div class="markdown-content">{@html renderMarkdown(renderBlocks(message.blocks))}</div>
              {:else}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <div class="markdown-content">{@html renderMarkdown(message.content)}</div>
              {/if}
            </div>
          </div>
        {/each}

        <!-- Streaming indicator -->
        {#if conv.isStreaming}
          <div class="message assistant streaming">
            <div class="message-header">
              <span class="message-role">
                <span class="role-icon assistant-icon">⚡ Claude</span>
              </span>
              <span class="streaming-badge">Streaming…</span>
            </div>
            <div class="message-body">
              {#if conv.streamingContent}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <div class="markdown-content">{@html renderMarkdown(
                  conv.streamingBlocks.length > 0
                    ? renderBlocks(conv.streamingBlocks)
                    : conv.streamingContent
                )}</div>
              {:else}
                <div class="thinking-indicator">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Input bar for Claude conversation -->
    <InputBar bind:this={inputBarRef} />
  </div>
{/if}

<style>
  .conversation-view {
    flex: 1; width: 100%; height: 100%;
    display: flex; flex-direction: column;
    background: #0d0d0d; overflow: hidden;
  }
  .conversation-view.hidden { display: none; }

  .messages-scroll {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    scroll-behavior: smooth;
  }

  .messages-container {
    max-width: 860px; width: 100%;
    margin: 0 auto; padding: 24px 32px 32px;
  }

  /* ── Welcome ── */
  .welcome {
    text-align: center; padding: 80px 24px 48px;
    color: #6c7086;
  }
  .welcome-icon {
    font-size: 48px; margin-bottom: 16px;
  }
  .welcome h2 {
    font-size: 22px; font-weight: 600; color: #cdd6f4; margin: 0 0 8px;
  }
  .welcome p {
    font-size: 14px; color: #6c7086; margin: 0;
  }

  /* ── Messages ── */
  .message {
    margin-bottom: 24px;
  }

  .message-header {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 8px;
  }

  .message-role {
    font-size: 13px; font-weight: 600;
  }

  .role-icon {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px; border-radius: 6px;
    font-size: 12px; font-weight: 600;
  }
  .user-icon {
    background: rgba(137, 180, 250, 0.1); color: #89b4fa;
  }
  .assistant-icon {
    background: rgba(203, 166, 247, 0.1); color: #cba6f7;
  }

  .message-time {
    font-size: 11px; color: #45475a;
    font-family: 'D2Coding', 'JetBrains Mono', monospace;
  }

  .streaming-badge {
    font-size: 11px; color: #cba6f7;
    padding: 2px 8px; border-radius: 4px;
    background: rgba(203, 166, 247, 0.08);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .message-body {
    padding-left: 4px;
  }

  /* ── User message ── */
  .user-text {
    font-size: 14px; line-height: 1.6; color: #cdd6f4;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    white-space: pre-wrap; word-break: break-word;
    background: rgba(137, 180, 250, 0.04);
    padding: 12px 16px; border-radius: 10px;
    border: 1px solid rgba(137, 180, 250, 0.08);
  }

  /* ── Assistant message (markdown) ── */
  .markdown-content {
    font-size: 14px; line-height: 1.7; color: #cdd6f4;
    font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  }
  .markdown-content :global(h1) { font-size: 22px; font-weight: 700; color: #e6e6e6; margin: 20px 0 10px; }
  .markdown-content :global(h2) { font-size: 18px; font-weight: 600; color: #e6e6e6; margin: 18px 0 8px; }
  .markdown-content :global(h3) { font-size: 16px; font-weight: 600; color: #e6e6e6; margin: 16px 0 6px; }
  .markdown-content :global(p) { margin: 0 0 12px; }
  .markdown-content :global(a) { color: #89b4fa; text-decoration: none; }
  .markdown-content :global(a:hover) { text-decoration: underline; }
  .markdown-content :global(strong) { font-weight: 600; color: #e6e6e6; }
  .markdown-content :global(code) {
    font-family: 'D2Coding', 'JetBrains Mono', monospace;
    background: #1e1e2e; color: #cba6f7; padding: 2px 6px; border-radius: 4px;
    font-size: 0.88em;
  }
  .markdown-content :global(pre) {
    background: #1e1e2e; border: 1px solid #313244; border-radius: 8px;
    padding: 14px 18px; overflow-x: auto; margin: 0 0 16px;
  }
  .markdown-content :global(pre code) {
    background: none; padding: 0; color: #cdd6f4; font-size: 13px; line-height: 1.5;
  }
  .markdown-content :global(blockquote) {
    border-left: 3px solid #cba6f7; padding: 8px 16px; margin: 0 0 12px;
    color: #a6adc8; background: rgba(203, 166, 247, 0.04); border-radius: 0 6px 6px 0;
  }
  .markdown-content :global(ul), .markdown-content :global(ol) {
    padding-left: 24px; margin: 0 0 12px;
  }
  .markdown-content :global(li) { margin: 4px 0; }
  .markdown-content :global(hr) {
    border: none; border-top: 1px solid #313244; margin: 20px 0;
  }
  .markdown-content :global(table) { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13px; }
  .markdown-content :global(th) { text-align: left; padding: 8px 12px; border-bottom: 2px solid #313244; color: #e6e6e6; font-weight: 600; }
  .markdown-content :global(td) { padding: 6px 12px; border-bottom: 1px solid #1e1e2e; }
  .markdown-content :global(details) {
    margin: 8px 0; padding: 8px 12px; border-radius: 6px;
    background: rgba(69, 71, 90, 0.2); border: 1px solid #313244;
  }
  .markdown-content :global(summary) {
    cursor: pointer; font-weight: 500; color: #a6adc8; font-size: 13px;
  }

  /* ── Thinking dots ── */
  .thinking-indicator {
    display: flex; gap: 6px; padding: 12px 0;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #cba6f7; opacity: 0.3;
    animation: dot-bounce 1.4s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes dot-bounce {
    0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
    40% { opacity: 1; transform: scale(1.2); }
  }
</style>
