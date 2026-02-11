/**
 * Shared agent color and name utilities.
 * Used by claude-session store, ConversationView, and SkillsPanel.
 * Single source of truth — eliminates 80+ lines of duplication.
 */
import type { CustomSkill } from '../types/index.js'

// ── Color Map ──────────────────────────────────────────────────────────────────

/** Named color keywords → hex (matches Claude Code's agent color palette) */
export const AGENT_COLOR_MAP: Record<string, string> = {
  blue: '#61afef',
  purple: '#c678dd',
  green: '#98c379',
  yellow: '#e5c07b',
  cyan: '#56b6c2',
  orange: '#d19a66',
  red: '#e06c75',
  pink: '#e06c95',
  magenta: '#c678dd',
  teal: '#56b6c2',
  lime: '#a9dc76',
  indigo: '#7c8cf5',
  brown: '#be5046',
  white: '#abb2bf',
  gray: '#7f848e',
  grey: '#7f848e',
}

/** Deduplicated palette for hash-based fallback */
const PALETTE = Object.values(AGENT_COLOR_MAP).filter((v, i, a) => a.indexOf(v) === i)

// ── Color Resolution ───────────────────────────────────────────────────────────

/** Resolve a named color keyword (e.g. "purple") to hex. Returns null if unknown. */
export function resolveColorKeyword(keyword: string): string | null {
  return AGENT_COLOR_MAP[keyword.toLowerCase()] ?? null
}

/** Deterministic hash-based color from a string name */
export function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/**
 * Look up an agent's defined color from customSkills (parsed from .md frontmatter).
 * Returns hex color or null if not found.
 */
export function lookupAgentColor(agentName: string, customSkills: CustomSkill[]): string | null {
  const normalized = agentName.toLowerCase().replace(/-/g, '_')
  for (const skill of customSkills) {
    if (skill.kind !== 'agent') continue
    const skillNorm = skill.name.toLowerCase().replace(/-/g, '_')
    if (skillNorm === normalized || skillNorm.endsWith(normalized) || normalized.endsWith(skillNorm)) {
      if (skill.color) return resolveColorKeyword(skill.color) ?? skill.color
    }
  }
  return null
}

/** Resolve color for a subagent: agent-defined → hash-based fallback */
export function resolveAgentColor(agentName: string, customSkills: CustomSkill[]): string {
  return lookupAgentColor(agentName, customSkills) ?? colorForName(agentName)
}

// ── Tool Identification ────────────────────────────────────────────────────────

/** Normalised set of subagent tool names (lowercase for case-insensitive match) */
const SUBAGENT_TOOLS = new Set(['task', 'delegate_task', 'agents', 'spawn_agent', 'create_agent', 'agent_task'])

/** Tools used to retrieve or cancel background subagent results */
const SUBAGENT_AUX_TOOLS = new Set([
  'taskoutput', 'background_output',
  'taskcancel', 'background_cancel'
])

/**
 * Known custom agent names (lowercase, hyphens normalized to underscores).
 * Populated from skillsStore.customSkills at runtime.
 */
const _knownAgentNames = new Set<string>()

/** Register known agent names from custom skills (call on skill scan) */
export function registerKnownAgents(skills: { name: string; kind: string }[]): void {
  _knownAgentNames.clear()
  for (const s of skills) {
    if (s.kind === 'agent') {
      _knownAgentNames.add(s.name.toLowerCase().replace(/-/g, '_'))
      // Also add without the leading slash if present
      const bare = s.name.replace(/^\//, '')
      _knownAgentNames.add(bare.toLowerCase().replace(/-/g, '_'))
    }
  }
}

/** Check if a tool name is a subagent/task tool (one that STARTS a subagent) */
export function isSubagentTool(name: string): boolean {
  const lower = name.toLowerCase()
  if (SUBAGENT_TOOLS.has(lower)) return true
  if (lower.startsWith('dispatch_agent')) return true
  // Check against known agent names (custom agents dispatched by name)
  const normalized = lower.replace(/-/g, '_')
  if (_knownAgentNames.has(normalized)) return true
  return false
}

/**
 * Detect if a tool_use looks like an agent dispatch based on its input fields.
 * Custom agents dispatched by name have inputs like { description, prompt, ... }
 * rather than typical tool fields like { file_path, command, query, ... }.
 */
export function looksLikeAgentDispatch(input: Record<string, unknown>): boolean {
  // Agent dispatch inputs typically have a 'prompt' or 'description' + 'task_description'
  const hasPrompt = typeof input.prompt === 'string' && input.prompt.length > 10
  const hasDesc = typeof input.description === 'string' && input.description.length > 5
  const hasTaskDesc = typeof input.task_description === 'string'
  const hasSubagentType = typeof input.subagent_type === 'string'
  // Typical tool fields — if these exist, it's probably a regular tool
  const hasToolFields = 'file_path' in input || 'command' in input || 'query' in input || 'pattern' in input || 'content' in input
  if (hasToolFields) return false
  return hasPrompt || hasDesc || hasTaskDesc || hasSubagentType || (hasDesc && Object.keys(input).length <= 5)
}

/** Check if a tool is subagent-auxiliary (TaskOutput, background_output, etc.) */
export function isSubagentAuxTool(name: string): boolean {
  return SUBAGENT_AUX_TOOLS.has(name.toLowerCase())
}

/**
 * Human-readable label for a subagent auxiliary tool.
 * When subagents are provided, resolves task_id to a human-readable name.
 * @param taskIdMap — optional persistent map of taskId → { name } for
 *   backgrounded agents that may no longer be in the active subagents array.
 */
export function subagentAuxLabel(
  name: string,
  input: Record<string, unknown>,
  subagents?: { taskId?: string; name: string; nestedStatus?: string; finished?: boolean }[],
  taskIdMap?: Map<string, { name: string; description: string }>
): string {
  const lower = name.toLowerCase()
  if (lower === 'taskoutput' || lower === 'background_output') {
    const taskId = typeof input.task_id === 'string' ? input.task_id : ''
    const blocking = input.block === true

    // Try to resolve task_id to a known subagent name
    let agentLabel = ''
    let lastActivity = ''
    if (taskId && subagents) {
      const match = subagents.find((s) => s.taskId === taskId)
      if (match) {
        agentLabel = match.name
        lastActivity = match.nestedStatus || ''
      }
    }
    // Fallback: check persistent taskId map (for backgrounded agents already cleared)
    if (!agentLabel && taskId && taskIdMap) {
      const cached = taskIdMap.get(taskId)
      if (cached) agentLabel = cached.name
    }
    // Fallback: if only one active (unfinished) subagent, it's probably that one
    if (!agentLabel && subagents) {
      const active = subagents.filter((s) => !s.finished)
      if (active.length === 1) {
        agentLabel = active[0].name
        lastActivity = active[0].nestedStatus || ''
      } else if (active.length > 1) {
        // Multiple agents: try the most recently started (last in array) that doesn't have a result yet
        const candidate = active[active.length - 1]
        agentLabel = candidate.name
        lastActivity = candidate.nestedStatus || ''
      }
    }

    // Human-readable label — never show raw hash to users
    const label = agentLabel || 'agent'
    const activity = lastActivity && !UNINFORMATIVE_STATUSES.has(lastActivity)
      ? ` — ${lastActivity}`
      : ''

    return blocking
      ? `Waiting for ${label}${activity}`
      : `Checking ${label} status${activity}`
  }
  if (lower === 'taskcancel' || lower === 'background_cancel') {
    return input.all === true ? 'Cancelling all background tasks…' : 'Cancelling background task…'
  }
  return name
}

/** Statuses that are too generic to display as "activity" context */
const UNINFORMATIVE_STATUSES = new Set([
  'Executing…', 'Starting…', 'Working…', 'Processing…', 'Preparing…', 'Running in background…'
])

/**
 * Build a summary string describing what all active subagents are doing.
 * Used to replace the vague "Processing…" status.
 */
export function buildSubagentSummary(
  subagents: { name: string; nestedStatus?: string; finished?: boolean }[]
): string {
  const active = subagents.filter((s) => !s.finished)
  if (active.length === 0) return ''

  // Collect informative statuses
  const details = active
    .map((s) => {
      const status = s.nestedStatus || ''
      if (!status || UNINFORMATIVE_STATUSES.has(status)) return null
      return `${s.name}: ${status}`
    })
    .filter(Boolean)

  if (details.length > 0) return details[0]!
  // All agents running but no specific activity — show agent count
  if (active.length === 1) return `${active[0].name} working…`
  return `${active.length} agents working…`
}

// ── Name Extraction ────────────────────────────────────────────────────────────

/** Extract a human-readable agent name from the tool name and/or input */
export function extractSubagentName(toolName: string, input: Record<string, unknown>): string {
  const lower = toolName.toLowerCase()

  // dispatch_agent_frontend_architect → "frontend-architect"
  if (lower.startsWith('dispatch_agent_')) {
    return toolName.slice('dispatch_agent_'.length).replace(/_/g, '-')
  }

  // subagent_type is the primary agent role identifier (e.g. "explore", "frontend-ui-ux-engineer")
  if (typeof input.subagent_type === 'string' && input.subagent_type) {
    return input.subagent_type.replace(/_/g, '-')
  }

  // Agents tool — input may carry agent_name or name
  if (typeof input.agent_name === 'string' && input.agent_name) {
    return input.agent_name.replace(/_/g, '-')
  }
  if (typeof input.name === 'string' && input.name) {
    return input.name.replace(/_/g, '-')
  }

  // category field (delegate_task uses this, e.g. "quick")
  if (typeof input.category === 'string' && input.category) {
    return input.category.replace(/_/g, '-')
  }

  // If the tool name itself looks like an agent name (not a standard tool name),
  // use it as the agent name. Custom agents dispatched directly use their name as tool name.
  const STANDARD_TOOLS = new Set([
    'task', 'delegate_task', 'agents', 'spawn_agent', 'create_agent', 'agent_task',
    'read', 'write', 'edit', 'multiedit', 'bash', 'glob', 'grep', 'ls',
    'webfetch', 'todoread', 'todowrite', 'taskoutput', 'background_output',
    'taskcancel', 'background_cancel'
  ])
  if (!STANDARD_TOOLS.has(lower) && !lower.startsWith('mcp__')) {
    // If it's a known agent name, return it formatted
    const normalized = lower.replace(/-/g, '_')
    if (_knownAgentNames.has(normalized)) {
      return toolName.replace(/_/g, '-')
    }
  }

  return ''
}

/** Check if a Task tool input indicates a backgrounded (non-blocking) task */
export function isBackgroundTask(input: Record<string, unknown>): boolean {
  return input.background === true || input.bg === true || input.type === 'background'
}

/**
 * Detect if a tool_result content looks like a "task started" response
 * (just a task_id assignment) rather than an actual completed result.
 * Backgrounded tasks return a short result with only a task_id.
 */
export function looksLikeTaskIdResult(content: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  // Very short result that contains a hex task_id pattern
  if (trimmed.length < 200 && /[a-f0-9]{6,12}/i.test(trimmed)) {
    // Check for common task_id patterns
    if (/task[_-]?id/i.test(trimmed)) return true
    if (/started\s+(task|background)/i.test(trimmed)) return true
    if (/^[a-f0-9]{6,12}$/i.test(trimmed)) return true
    // If the entire result is basically just a short ID-like string
    if (trimmed.length < 80) return true
  }
  return false
}

/** Extract subagent description from tool input */
export function extractSubagentDesc(input: Record<string, unknown>): string {
  if (typeof input.description === 'string' && input.description) return input.description
  if (typeof input.prompt === 'string' && input.prompt) {
    return input.prompt.length > 120 ? input.prompt.slice(0, 120) + '…' : input.prompt
  }
  if (typeof input.task_description === 'string') return input.task_description
  return ''
}
