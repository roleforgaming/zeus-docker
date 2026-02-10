import type { MCPServer, ClaudeConfig, McpHealthEntry } from '../types/index.js'

// ── MCP Store ──────────────────────────────────────────────────────────────────

class MCPStore {
  servers = $state<MCPServer[]>([])
  loading = $state(false)
  installing = $state(false)

  /** Health status per server name */
  health = $state<Map<string, McpHealthEntry>>(new Map())
  healthLoading = $state(false)

  async load() {
    this.loading = true
    try {
      const config: ClaudeConfig = await window.zeus.claudeConfig.read()
      const mcpServers = config.mcpServers ?? {}
      const disabledServers = config._disabledMcpServers ?? {}

      const active = Object.entries(mcpServers).map(([name, def]) => ({
        name,
        command: def.command,
        args: def.args ?? [],
        env: def.env ?? {},
        enabled: true
      }))
      const disabled = Object.entries(disabledServers).map(([name, def]) => ({
        name,
        command: def.command,
        args: def.args ?? [],
        env: def.env ?? {},
        enabled: false
      }))

      this.servers = [...active, ...disabled]
    } finally {
      this.loading = false
    }
  }

  /** Disconnect: move server from mcpServers → _disabledMcpServers */
  async disconnect(name: string) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    const serverDef = config.mcpServers?.[name]
    if (!serverDef) return
    // Move to disabled
    if (!config._disabledMcpServers) config._disabledMcpServers = {}
    config._disabledMcpServers[name] = serverDef
    delete config.mcpServers![name]
    await window.zeus.claudeConfig.write(config)
    await this.load()
  }

  /** Connect: move server from _disabledMcpServers → mcpServers */
  async connect(name: string) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    const serverDef = config._disabledMcpServers?.[name]
    if (!serverDef) return
    // Move to active
    if (!config.mcpServers) config.mcpServers = {}
    config.mcpServers[name] = serverDef
    delete config._disabledMcpServers![name]
    // Clean up empty object
    if (Object.keys(config._disabledMcpServers!).length === 0) {
      delete config._disabledMcpServers
    }
    await window.zeus.claudeConfig.write(config)
    await this.load()
  }

  async addServer(server: { name: string; command: string; args: string[]; env: Record<string, string> }) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    if (!config.mcpServers) config.mcpServers = {}

    config.mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env
    }

    await window.zeus.claudeConfig.write(config)
    await this.load()
  }

  async removeServer(name: string) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    if (config.mcpServers) {
      delete config.mcpServers[name]
    }
    // Also remove from disabled list
    if (config._disabledMcpServers) {
      delete config._disabledMcpServers[name]
      if (Object.keys(config._disabledMcpServers).length === 0) {
        delete config._disabledMcpServers
      }
    }
    // Also clean up permissions referencing this server
    if (config.permissions) {
      const prefix = `mcp__${name}`
      if (config.permissions.allow) {
        config.permissions.allow = config.permissions.allow.filter((p) => !p.startsWith(prefix))
      }
      if (config.permissions.deny) {
        config.permissions.deny = config.permissions.deny.filter((p) => !p.startsWith(prefix))
      }
    }
    await window.zeus.claudeConfig.write(config)
    await this.load()
  }

  async updateServer(name: string, command: string, args: string[]) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    if (config.mcpServers?.[name]) {
      config.mcpServers[name].command = command
      config.mcpServers[name].args = args
      await window.zeus.claudeConfig.write(config)
      await this.load()
    }
  }

  async updateServerEnv(name: string, key: string, value: string) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    if (config.mcpServers?.[name]) {
      if (!config.mcpServers[name].env) config.mcpServers[name].env = {}
      config.mcpServers[name].env![key] = value
      await window.zeus.claudeConfig.write(config)
      await this.load()
    }
  }

  async removeServerEnv(name: string, key: string) {
    const config: ClaudeConfig = await window.zeus.claudeConfig.read()
    if (config.mcpServers?.[name]?.env) {
      delete config.mcpServers[name].env![key]
      await window.zeus.claudeConfig.write(config)
      await this.load()
    }
  }

  async checkHealth() {
    this.healthLoading = true
    try {
      const entries = await window.zeus.mcp.health()
      const map = new Map<string, McpHealthEntry>()
      for (const e of entries) {
        map.set(e.name, e)
      }
      this.health = map
    } catch {
      // ignore
    } finally {
      this.healthLoading = false
    }
  }

  /** Get health for a server by name (tries exact match, then suffix match for plugin: prefix) */
  getHealth(name: string): McpHealthEntry | undefined {
    if (this.health.has(name)) return this.health.get(name)
    // claude mcp list may show "plugin:xxx:name" — try suffix match
    for (const [key, entry] of this.health) {
      if (key.endsWith(':' + name) || key === name) return entry
    }
    return undefined
  }

  async installPackage(pkg: string): Promise<{ success: boolean; error?: string }> {
    this.installing = true
    try {
      const result = await window.zeus.mcp.install(pkg)
      return result
    } finally {
      this.installing = false
    }
  }
}

export const mcpStore = new MCPStore()
