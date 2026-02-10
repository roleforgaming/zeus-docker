<script lang="ts">
  import { skillsStore } from '../stores/skills.svelte.js'
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'
  import type { CustomSkill } from '../types/index.js'

  $effect(() => {
    // Reload when workspace or scope changes
    const ws = workspaceStore.active
    const scope = skillsStore.scope
    skillsStore.load(ws?.path)
  })

  function toggleSkill(skillId: string) {
    skillsStore.toggle(skillId, workspaceStore.active?.path).then(() => {
      const skill = skillsStore.skills.find((s) => s.id === skillId)
      if (skill) {
        uiStore.showToast(`${skill.name} ${skill.enabled ? 'enabled' : 'disabled'}`, 'info')
      }
    })
  }

  function copyCommand(skill: CustomSkill) {
    const cmd = skillsStore.getSlashCommand(skill)
    navigator.clipboard.writeText(cmd).then(() => {
      uiStore.showToast(`Copied ${cmd}`, 'info')
    })
  }

  function openPreview(skill: CustomSkill) {
    skillsStore.openPreview(skill)
  }

</script>

<div class="skills-panel">
  {#if skillsStore.previewSkill}
    <!-- ─── Skill Preview ───────────────────────────────── -->
    <div class="preview">
      <div class="preview-header">
        <button class="back-btn" onclick={() => skillsStore.closePreview()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="preview-title">
          <span class="preview-name">{skillsStore.previewSkill.name}</span>
          <span class="preview-cmd">{skillsStore.getSlashCommand(skillsStore.previewSkill)}</span>
        </div>
        <button
          class="copy-btn"
          title="Copy command"
          onclick={() => copyCommand(skillsStore.previewSkill!)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <div class="preview-meta">
        <span class="badge" class:user={skillsStore.previewSkill.scope === 'user'} class:project={skillsStore.previewSkill.scope === 'project'}>
          {skillsStore.previewSkill.scope}
        </span>
        <span class="preview-path">{skillsStore.getRelativePath(skillsStore.previewSkill, workspaceStore.active?.path)}</span>
      </div>
      <div class="preview-body">
        <pre>{skillsStore.previewContent}</pre>
      </div>
    </div>
  {:else}
    <!-- ─── Scope Toggle ────────────────────────────────── -->
    <div class="scope-bar">
      <button
        class="scope-btn"
        class:active={skillsStore.scope === 'global'}
        onclick={() => skillsStore.setScope('global')}
      >Global</button>
      <button
        class="scope-btn"
        class:active={skillsStore.scope === 'project'}
        disabled={!workspaceStore.active}
        onclick={() => skillsStore.setScope('project')}
      >Project</button>
    </div>

    {#if skillsStore.loading}
      <div class="loading"><div class="spinner"></div></div>
    {:else}
      <!-- ─── Custom Slash Commands (User) ──────────────── -->
      {#if skillsStore.userCustomSkills.length > 0}
        <div class="section">
          <div class="section-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            User Commands
            <span class="count">{skillsStore.userCustomSkills.length}</span>
          </div>
          {#each skillsStore.userCustomSkills as skill (skill.filePath)}
            <div class="custom-skill-item">
              <button class="skill-body" onclick={() => openPreview(skill)}>
                <span class="cmd-name">/{skill.name}</span>
                <span class="cmd-desc">{skill.content.slice(0, 80).replace(/\n/g, ' ')}{skill.content.length > 80 ? '...' : ''}</span>
              </button>
              <div class="skill-actions">
                <button class="action-btn" title="Copy command" onclick={() => copyCommand(skill)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- ─── Custom Slash Commands (Project) ───────────── -->
      {#if skillsStore.projectCustomSkills.length > 0}
        <div class="section">
          <div class="section-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Project Commands
            <span class="count">{skillsStore.projectCustomSkills.length}</span>
          </div>
          {#each skillsStore.projectCustomSkills as skill (skill.filePath)}
            <div class="custom-skill-item">
              <button class="skill-body" onclick={() => openPreview(skill)}>
                <div class="cmd-row">
                  <span class="cmd-name">/{skill.name}</span>
                  {#if skill.relativeTo !== workspaceStore.active?.path}
                    <span class="cmd-origin" title={skill.relativeTo}>
                      {skill.relativeTo.split('/').pop()}
                    </span>
                  {/if}
                </div>
                <span class="cmd-desc">{skill.content.slice(0, 80).replace(/\n/g, ' ')}{skill.content.length > 80 ? '...' : ''}</span>
                <span class="cmd-path">{skillsStore.getRelativePath(skill, workspaceStore.active?.path)}</span>
              </button>
              <div class="skill-actions">
                <button class="action-btn" title="Copy command" onclick={() => copyCommand(skill)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- ─── No custom commands found ──────────────────── -->
      {#if skillsStore.customSkills.length === 0}
        <div class="empty-custom">
          <div class="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>
          </div>
          <p class="empty-title">No Custom Commands</p>
          <p class="empty-desc">
            Add <code>.md</code> files to <code>.claude/commands/</code> in your project or <code>~/.claude/commands/</code> globally.
          </p>
        </div>
      {/if}

      <!-- ─── Built-in Tools ────────────────────────────── -->
      <div class="section">
        <div class="section-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          Built-in Tools
        </div>
        {#each skillsStore.builtinSkills as skill (skill.id)}
          <label class="skill-item">
            <div class="skill-info">
              <span class="skill-name">{skill.name}</span>
              <span class="skill-desc-text">{skill.description}</span>
            </div>
            <div class="toggle" class:on={skill.enabled}>
              <input
                type="checkbox"
                checked={skill.enabled}
                onchange={() => toggleSkill(skill.id)}
              />
              <span class="toggle-slider"></span>
            </div>
          </label>
        {/each}
      </div>

      <!-- ─── MCP Tools ─────────────────────────────────── -->
      {#if skillsStore.mcpSkills.length > 0}
        <div class="section">
          <div class="section-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            MCP Tools
          </div>
          {#each skillsStore.mcpSkills as skill (skill.id)}
            <label class="skill-item">
              <div class="skill-info">
                <span class="skill-name">{skill.name}</span>
                <span class="skill-desc-text">{skill.description}</span>
              </div>
              <div class="toggle" class:on={skill.enabled}>
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  onchange={() => toggleSkill(skill.id)}
                />
                <span class="toggle-slider"></span>
              </div>
            </label>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .skills-panel { padding: 12px; overflow-y: auto; height: 100%; }

  /* ── Scope bar ── */
  .scope-bar {
    display: flex; gap: 4px; margin-bottom: 16px;
    background: #1a1a1a; border-radius: 6px; padding: 3px;
  }
  .scope-btn {
    flex: 1; padding: 6px 12px; border: none; background: transparent;
    color: #999; font-size: 12px; font-weight: 500; border-radius: 4px;
    cursor: pointer; transition: all 120ms ease; font-family: inherit;
  }
  .scope-btn:hover:not(:disabled) { color: #e6e6e6; }
  .scope-btn.active { background: #262626; color: #e6e6e6; }
  .scope-btn:disabled { opacity: 0.4; cursor: default; }

  /* ── Loading ── */
  .loading { display: flex; justify-content: center; padding: 32px; }
  .spinner {
    width: 20px; height: 20px; border: 2px solid #333;
    border-top-color: #c084fc; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Sections ── */
  .section { margin-bottom: 20px; }
  .section-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #666; padding: 0 4px 8px;
  }
  .section-label .count {
    background: #262626; color: #999; font-size: 9px;
    padding: 1px 5px; border-radius: 8px; font-weight: 500;
  }

  /* ── Custom skill items ── */
  .custom-skill-item {
    display: flex; align-items: flex-start; gap: 4px;
    border-radius: 6px; transition: background 120ms ease;
  }
  .custom-skill-item:hover { background: #1a1a1a; }

  .skill-body {
    flex: 1; min-width: 0; padding: 8px 10px; border: none;
    background: transparent; text-align: left; cursor: pointer;
    display: flex; flex-direction: column; gap: 2px;
    font-family: inherit;
  }

  .cmd-row { display: flex; align-items: center; gap: 6px; }

  .cmd-name {
    font-size: 13px; font-weight: 600; color: #c084fc;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
  }
  .cmd-origin {
    font-size: 10px; color: #666; background: #1e1e1e;
    padding: 1px 5px; border-radius: 3px;
  }
  .cmd-desc {
    font-size: 11px; color: #888; line-height: 1.4;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmd-path {
    font-size: 10px; color: #555; font-family: 'D2Coding', 'JetBrains Mono', monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .skill-actions {
    display: flex; align-items: center; padding: 8px 6px 0 0;
    opacity: 0; transition: opacity 120ms ease;
  }
  .custom-skill-item:hover .skill-actions { opacity: 1; }

  .action-btn {
    width: 26px; height: 26px; border: none; border-radius: 4px;
    background: transparent; color: #666; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 120ms ease;
  }
  .action-btn:hover { background: #262626; color: #e6e6e6; }

  /* ── Empty state ── */
  .empty-custom {
    text-align: center; padding: 24px 16px; color: #666;
  }
  .empty-icon { margin-bottom: 12px; opacity: 0.4; }
  .empty-title { font-size: 13px; font-weight: 600; color: #888; margin: 0 0 6px; }
  .empty-desc { font-size: 11px; line-height: 1.6; margin: 0; }
  .empty-desc code {
    background: #1e1e1e; padding: 1px 5px; border-radius: 3px;
    font-size: 11px; font-family: 'D2Coding', 'JetBrains Mono', monospace;
    color: #c084fc;
  }

  /* ── Built-in / MCP skill items ── */
  .skill-item {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 10px 10px; border-radius: 6px;
    cursor: pointer; transition: background 120ms ease;
  }
  .skill-item:hover { background: #1a1a1a; }

  .skill-info { flex: 1; min-width: 0; }
  .skill-name {
    display: block; font-size: 13px; font-weight: 500; color: #e6e6e6;
  }
  .skill-desc-text {
    display: block; font-size: 11px; color: #666; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Toggle switch ── */
  .toggle {
    position: relative; width: 36px; height: 20px; flex-shrink: 0;
  }
  .toggle input {
    position: absolute; opacity: 0; width: 0; height: 0;
  }
  .toggle-slider {
    position: absolute; inset: 0;
    background: #333; border-radius: 10px;
    transition: background 200ms ease;
  }
  .toggle-slider::after {
    content: ''; position: absolute;
    width: 16px; height: 16px; border-radius: 50%;
    background: #999; top: 2px; left: 2px;
    transition: transform 200ms ease, background 200ms ease;
  }
  .toggle.on .toggle-slider { background: rgba(192, 132, 252, 0.3); }
  .toggle.on .toggle-slider::after {
    transform: translateX(16px); background: #c084fc;
  }

  /* ── Preview ── */
  .preview { display: flex; flex-direction: column; height: 100%; }

  .preview-header {
    display: flex; align-items: center; gap: 8px;
    padding: 0 0 12px; border-bottom: 1px solid #1e1e1e;
  }
  .back-btn {
    width: 28px; height: 28px; border: none; border-radius: 6px;
    background: #1a1a1a; color: #999; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 120ms ease; flex-shrink: 0;
  }
  .back-btn:hover { background: #262626; color: #e6e6e6; }

  .preview-title { flex: 1; min-width: 0; }
  .preview-name {
    display: block; font-size: 14px; font-weight: 600; color: #e6e6e6;
  }
  .preview-cmd {
    display: block; font-size: 11px; color: #c084fc; margin-top: 2px;
    font-family: 'D2Coding', 'JetBrains Mono', monospace;
  }

  .copy-btn {
    width: 28px; height: 28px; border: none; border-radius: 6px;
    background: #1a1a1a; color: #999; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 120ms ease; flex-shrink: 0;
  }
  .copy-btn:hover { background: #262626; color: #e6e6e6; }

  .preview-meta {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 0 8px; font-size: 11px;
  }
  .badge {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    padding: 2px 6px; border-radius: 4px; letter-spacing: 0.04em;
  }
  .badge.user { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
  .badge.project { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
  .preview-path {
    color: #555; font-family: 'D2Coding', 'JetBrains Mono', monospace;
    font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .preview-body {
    flex: 1; overflow-y: auto; padding: 12px 0;
  }
  .preview-body pre {
    font-size: 12px; line-height: 1.6; color: #ccc; margin: 0;
    white-space: pre-wrap; word-break: break-word;
    font-family: 'D2Coding', 'JetBrains Mono', 'SF Mono', monospace;
  }
</style>
