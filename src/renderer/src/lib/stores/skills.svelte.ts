import type { Skill, CustomSkill, ClaudeConfig } from '../types/index.js'

// ── Built-in Claude Code skills ────────────────────────────────────────────────

const BUILTIN_SKILLS: Omit<Skill, 'enabled'>[] = [
  { id: 'bash', name: 'Bash', description: 'Execute shell commands in the terminal', category: 'builtin', pattern: 'Bash' },
  { id: 'read-file', name: 'Read File', description: 'Read contents of files in the workspace', category: 'builtin', pattern: 'Read' },
  { id: 'write-file', name: 'Write File', description: 'Create and overwrite files in the workspace', category: 'builtin', pattern: 'Write' },
  { id: 'edit-file', name: 'Edit File', description: 'Make targeted edits to existing files', category: 'builtin', pattern: 'Edit' },
  { id: 'multi-edit', name: 'Multi Edit', description: 'Apply multiple edits to a single file at once', category: 'builtin', pattern: 'MultiEdit' },
  { id: 'glob', name: 'Glob', description: 'Find files matching glob patterns', category: 'builtin', pattern: 'Glob' },
  { id: 'grep', name: 'Grep', description: 'Search file contents with regex patterns', category: 'builtin', pattern: 'Grep' },
  { id: 'ls', name: 'List Directory', description: 'List files and directories', category: 'builtin', pattern: 'LS' },
  { id: 'browser', name: 'Browser', description: 'Navigate and interact with web pages', category: 'builtin', pattern: 'Browser' },
  { id: 'notebook-edit', name: 'Notebook Edit', description: 'Edit Jupyter notebook cells', category: 'builtin', pattern: 'NotebookEdit' },
  { id: 'todo-read', name: 'Task List', description: 'Read and manage structured task lists', category: 'builtin', pattern: 'TodoRead' }
]

// ── Skills Store ───────────────────────────────────────────────────────────────

class SkillsStore {
  skills = $state<Skill[]>([])
  customSkills = $state<CustomSkill[]>([])
  scope = $state<'global' | 'project'>('global')
  loading = $state(false)

  /** Currently previewed custom skill (null = list view) */
  previewSkill = $state<CustomSkill | null>(null)
  previewContent = $state<string>('')

  builtinSkills = $derived(this.skills.filter((s) => s.category === 'builtin'))
  mcpSkills = $derived(this.skills.filter((s) => s.category === 'mcp'))
  userCustomSkills = $derived(this.customSkills.filter((s) => s.scope === 'user'))
  projectCustomSkills = $derived(this.customSkills.filter((s) => s.scope === 'project'))

  async load(workspacePath?: string) {
    this.loading = true
    try {
      const globalConfig: ClaudeConfig = await window.zeus.claudeConfig.read()
      const projectConfig: ClaudeConfig = workspacePath
        ? await window.zeus.claudeConfig.readProject(workspacePath)
        : {}

      const config = this.scope === 'project' && workspacePath ? projectConfig : globalConfig
      const allowed = config.permissions?.allow ?? []
      const denied = config.permissions?.deny ?? []

      // Build skills list from builtins
      const skills: Skill[] = BUILTIN_SKILLS.map((s) => ({
        ...s,
        enabled: this.isSkillEnabled(s.pattern, allowed, denied)
      }))

      // Discover MCP skills from config
      if (globalConfig.mcpServers) {
        for (const serverName of Object.keys(globalConfig.mcpServers)) {
          skills.push({
            id: `mcp-${serverName}`,
            name: serverName,
            description: `MCP server: ${serverName}`,
            category: 'mcp',
            pattern: `mcp__${serverName}`,
            enabled: this.isSkillEnabled(`mcp__${serverName}`, allowed, denied)
          })
        }
      }

      this.skills = skills

      // Scan custom slash commands from filesystem
      if (workspacePath) {
        this.customSkills = await window.zeus.skills.scan(workspacePath)
      } else {
        // Still load global user commands even without a workspace
        this.customSkills = await window.zeus.skills.scan('')
      }
    } finally {
      this.loading = false
    }
  }

  private isSkillEnabled(pattern: string, allowed: string[], denied: string[]): boolean {
    if (denied.some((d) => d.startsWith(pattern))) return false
    if (allowed.some((a) => a.startsWith(pattern) || a === '*')) return true
    return true
  }

  async toggle(skillId: string, workspacePath?: string) {
    const skill = this.skills.find((s) => s.id === skillId)
    if (!skill) return

    const newEnabled = !skill.enabled

    const isProject = this.scope === 'project' && !!workspacePath
    const config: ClaudeConfig = isProject
      ? await window.zeus.claudeConfig.readProject(workspacePath!)
      : await window.zeus.claudeConfig.read()

    if (!config.permissions) config.permissions = { allow: [], deny: [] }
    if (!config.permissions.allow) config.permissions.allow = []
    if (!config.permissions.deny) config.permissions.deny = []

    const { allow, deny } = config.permissions

    if (newEnabled) {
      config.permissions.deny = deny.filter((d) => !d.startsWith(skill.pattern))
      if (!allow.some((a) => a.startsWith(skill.pattern))) {
        allow.push(`${skill.pattern}(*)`)
      }
    } else {
      config.permissions.allow = allow.filter((a) => !a.startsWith(skill.pattern))
      if (!deny.some((d) => d.startsWith(skill.pattern))) {
        deny.push(`${skill.pattern}(*)`)
      }
    }

    if (isProject) {
      await window.zeus.claudeConfig.writeProject(workspacePath!, config)
    } else {
      await window.zeus.claudeConfig.write(config)
    }

    await this.load(workspacePath)
  }

  /** Open a custom skill's .md file for preview */
  async openPreview(skill: CustomSkill) {
    const content = await window.zeus.files.read(skill.filePath)
    this.previewSkill = skill
    this.previewContent = content ?? '*(empty file)*'
  }

  closePreview() {
    this.previewSkill = null
    this.previewContent = ''
  }

  /** Get the slash command string for a custom skill */
  getSlashCommand(skill: CustomSkill): string {
    return skill.scope === 'user' ? `/user:${skill.name}` : `/project:${skill.name}`
  }

  /** Relative path display (from workspace root) */
  getRelativePath(skill: CustomSkill, workspacePath?: string): string {
    if (!workspacePath) return skill.filePath
    const base = workspacePath.endsWith('/') ? workspacePath : workspacePath + '/'
    if (skill.filePath.startsWith(base)) {
      return skill.filePath.slice(base.length)
    }
    // If it's a global skill, show ~ prefix
    if (skill.scope === 'user') {
      return `~/.claude/commands/${skill.filename}`
    }
    return skill.filePath
  }

  setScope(scope: 'global' | 'project') {
    this.scope = scope
  }
}

export const skillsStore = new SkillsStore()
