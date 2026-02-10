<script lang="ts">
  import { mcpStore } from '../stores/mcp.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
  import IconPlus from './icons/IconPlus.svelte'

  let addMode = $state(false)
  let editingEnv = $state<string | null>(null) // server name being edited

  // Form fields for new server
  let newName = $state('')
  let newCommand = $state('npx')
  let newArgs = $state('')
  let newEnvKey = $state('')
  let newEnvValue = $state('')
  let envEntries = $state<Array<{ key: string; value: string }>>([])

  // Env editing for existing server
  let editEnvKey = $state('')
  let editEnvValue = $state('')

  $effect(() => {
    mcpStore.load()
  })

  function resetForm() {
    newName = ''
    newCommand = 'npx'
    newArgs = ''
    envEntries = []
    newEnvKey = ''
    newEnvValue = ''
    addMode = false
  }

  function addEnvEntry() {
    if (newEnvKey.trim()) {
      envEntries = [...envEntries, { key: newEnvKey.trim(), value: newEnvValue }]
      newEnvKey = ''
      newEnvValue = ''
    }
  }

  function removeEnvEntry(idx: number) {
    envEntries = envEntries.filter((_, i) => i !== idx)
  }

  async function addServer() {
    if (!newName.trim() || !newCommand.trim()) {
      uiStore.showToast('Name and command are required', 'error')
      return
    }

    const env: Record<string, string> = {}
    for (const e of envEntries) {
      env[e.key] = e.value
    }

    await mcpStore.addServer({
      name: newName.trim(),
      command: newCommand.trim(),
      args: newArgs.trim() ? newArgs.trim().split(/\s+/) : [],
      env
    })

    uiStore.showToast(`Added MCP server: ${newName}`, 'success')
    resetForm()
  }

  async function removeServer(name: string) {
    await mcpStore.removeServer(name)
    uiStore.showToast(`Removed: ${name}`, 'info')
  }

  async function addEnvToServer(serverName: string) {
    if (!editEnvKey.trim()) return
    await mcpStore.updateServerEnv(serverName, editEnvKey.trim(), editEnvValue)
    editEnvKey = ''
    editEnvValue = ''
    uiStore.showToast(`Updated env for ${serverName}`, 'info')
  }

  async function removeEnvFromServer(serverName: string, key: string) {
    await mcpStore.removeServerEnv(serverName, key)
  }

  async function installPkg() {
    const pkg = prompt('Enter npm package name to install globally:')
    if (!pkg) return
    uiStore.showToast(`Installing ${pkg}...`, 'info')
    const result = await mcpStore.installPackage(pkg)
    if (result.success) {
      uiStore.showToast(`Installed ${pkg}`, 'success')
    } else {
      uiStore.showToast(`Failed: ${result.error}`, 'error')
    }
  }
</script>

<div class="mcp-panel">
  <div class="panel-header">
    <span class="panel-title">MCP Servers</span>
    <div class="header-actions">
      <button class="icon-btn" title="Install npm package" onclick={installPkg}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      <button class="icon-btn" title="Add MCP server" onclick={() => (addMode = !addMode)}>
        <IconPlus size={14} />
      </button>
    </div>
  </div>

  <!-- Add form -->
  {#if addMode}
    <div class="add-form">
      <div class="form-group">
        <label class="form-label">Server Name</label>
        <input class="form-input" bind:value={newName} placeholder="e.g. github" />
      </div>
      <div class="form-group">
        <label class="form-label">Command</label>
        <input class="form-input" bind:value={newCommand} placeholder="e.g. npx" />
      </div>
      <div class="form-group">
        <label class="form-label">Arguments <span class="hint">(space-separated)</span></label>
        <input class="form-input" bind:value={newArgs} placeholder="e.g. -y @modelcontextprotocol/server-github" />
      </div>
      <div class="form-group">
        <label class="form-label">Environment Variables</label>
        {#each envEntries as entry, i (i)}
          <div class="env-row">
            <span class="env-key">{entry.key}</span>
            <span class="env-eq">=</span>
            <span class="env-val">{entry.value ? '••••' : '(empty)'}</span>
            <button class="remove-btn" onclick={() => removeEnvEntry(i)}>&times;</button>
          </div>
        {/each}
        <div class="env-add-row">
          <input class="form-input small" bind:value={newEnvKey} placeholder="KEY" />
          <input class="form-input small" bind:value={newEnvValue} placeholder="value" type="password" />
          <button class="add-env-btn" onclick={addEnvEntry}>+</button>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn secondary" onclick={resetForm}>Cancel</button>
        <button class="btn primary" onclick={addServer}>Add Server</button>
      </div>
    </div>
  {/if}

  <!-- Server list -->
  {#if mcpStore.loading}
    <div class="loading"><div class="spinner"></div></div>
  {:else if mcpStore.servers.length === 0 && !addMode}
    <div class="empty">
      <p>No MCP servers configured.</p>
      <p class="hint-text">MCP servers extend Claude Code with external tools.</p>
    </div>
  {:else}
    <div class="server-list">
      {#each mcpStore.servers as server (server.name)}
        <div class="server-card">
          <div class="server-header">
            <div class="server-info">
              <span class="server-name">{server.name}</span>
              <span class="server-cmd">{server.command} {server.args.join(' ')}</span>
            </div>
            <div class="server-actions">
              <button
                class="icon-btn-sm"
                title="Edit env vars"
                onclick={() => (editingEnv = editingEnv === server.name ? null : server.name)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
              <button class="icon-btn-sm danger" title="Remove" onclick={() => removeServer(server.name)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>

          <!-- Env section (expandable) -->
          {#if editingEnv === server.name}
            <div class="env-section">
              {#each Object.entries(server.env) as [key, value] (key)}
                <div class="env-row">
                  <span class="env-key">{key}</span>
                  <span class="env-eq">=</span>
                  <span class="env-val">{value ? '••••••' : '(empty)'}</span>
                  <button class="remove-btn" onclick={() => removeEnvFromServer(server.name, key)}>&times;</button>
                </div>
              {/each}
              <div class="env-add-row">
                <input class="form-input small" bind:value={editEnvKey} placeholder="KEY" />
                <input class="form-input small" bind:value={editEnvValue} placeholder="value" type="password" />
                <button class="add-env-btn" onclick={() => addEnvToServer(server.name)}>+</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mcp-panel { padding: 12px; overflow-y: auto; height: 100%; }

  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
  }
  .panel-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
  .header-actions { display: flex; gap: 4px; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border: none; background: transparent;
    color: #777; border-radius: 4px; cursor: pointer;
  }
  .icon-btn:hover { background: #1e1e1e; color: #bbb; }

  .loading { display: flex; justify-content: center; padding: 32px; }
  .spinner {
    width: 20px; height: 20px; border: 2px solid #252525;
    border-top-color: #b090e0; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty { text-align: center; padding: 32px 16px; color: #666; }
  .empty p { font-size: 13px; line-height: 1.5; }
  .hint-text { font-size: 11px; color: #555; margin-top: 4px; }

  /* Add form */
  .add-form {
    background: #1a1a1a; border-radius: 8px; padding: 14px;
    margin-bottom: 12px; border: 1px solid #1e1e1e;
  }
  .form-group { margin-bottom: 10px; }
  .form-label {
    display: block; font-size: 11px; font-weight: 500; color: #777;
    margin-bottom: 4px;
  }
  .form-label .hint { color: #555; font-weight: 400; }
  .form-input {
    width: 100%; padding: 7px 10px; border: 1px solid #252525;
    background: #0e0e0e; color: #bbb; border-radius: 5px;
    font-size: 13px; font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
    outline: none;
  }
  .form-input:focus { border-color: #b090e0; }
  .form-input.small { padding: 5px 8px; font-size: 12px; }

  .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .btn {
    padding: 6px 14px; border: 1px solid #252525; border-radius: 5px;
    font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
  }
  .btn.secondary { background: transparent; color: #777; }
  .btn.secondary:hover { background: #1e1e1e; color: #bbb; }
  .btn.primary {
    background: rgba(155, 111, 212, 0.1); border-color: rgba(155, 111, 212, 0.2);
    color: #b090e0;
  }
  .btn.primary:hover { background: rgba(155, 111, 212, 0.18); }

  /* Server cards */
  .server-list { display: flex; flex-direction: column; gap: 8px; }
  .server-card {
    background: #1a1a1a; border-radius: 8px; border: 1px solid #1e1e1e;
    overflow: hidden;
  }
  .server-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; gap: 8px;
  }
  .server-info { flex: 1; min-width: 0; }
  .server-name { display: block; font-size: 13px; font-weight: 500; color: #bbb; }
  .server-cmd {
    display: block; font-size: 11px; color: #666; margin-top: 2px;
    font-family: 'D2Coding', 'JetBrains Mono', monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .server-actions { display: flex; gap: 4px; flex-shrink: 0; }

  .icon-btn-sm {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border: none; background: transparent;
    color: #666; border-radius: 4px; cursor: pointer;
  }
  .icon-btn-sm:hover { background: #1e1e1e; color: #bbb; }
  .icon-btn-sm.danger:hover { color: #d66; }

  /* Env section */
  .env-section {
    padding: 8px 12px 10px; border-top: 1px solid #1e1e1e; background: #131313;
  }
  .env-row {
    display: flex; align-items: center; gap: 6px; padding: 4px 0;
    font-size: 12px; font-family: 'D2Coding', 'JetBrains Mono', monospace;
  }
  .env-key { color: #4a85c4; }
  .env-eq { color: #666; }
  .env-val { color: #888; flex: 1; }
  .remove-btn {
    width: 18px; height: 18px; border: none; background: transparent;
    color: #666; cursor: pointer; font-size: 14px; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
  }
  .remove-btn:hover { background: #1e1e1e; color: #d66; }

  .env-add-row { display: flex; gap: 4px; margin-top: 6px; align-items: center; }
  .env-add-row .form-input { flex: 1; }
  .add-env-btn {
    width: 28px; height: 28px; border: 1px solid #252525; background: transparent;
    color: #777; border-radius: 4px; cursor: pointer; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
  }
  .add-env-btn:hover { background: #1e1e1e; color: #bbb; border-color: #333; }
</style>
