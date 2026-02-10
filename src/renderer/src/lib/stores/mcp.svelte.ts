import type { MCPServer, ClaudeConfig } from '../types/index.js'

// ── MCP Store ──────────────────────────────────────────────────────────────────

class MCPStore {
  servers = $state<MCPServer[]>([])
  loading = $state(false)
  installing = $state(false)

  async load() {
    this.loading = true
    try {
      const config: ClaudeConfig = await window.zeus.claudeConfig.read()
      const mcpServers = config.mcpServers ?? {}

      this.servers = Object.entries(mcpServers).map(([name, def]) => ({
        name,
        command: def.command,
        args: def.args ?? [],
        env: def.env ?? {},
        enabled: true
      }))
    } finally {
      this.loading = false
    }
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
