import type { PluginEntry, MarketplaceEntry } from '../types/index.js'

// ── Plugin Store ────────────────────────────────────────────────────────────────

export interface OfficialPlugin {
  id: string       // install name (e.g. "github" or "github@claude-plugins-official")
  name: string     // display name
  desc: string
  marketplace: string
  category: string
}

export const OFFICIAL_PLUGINS: OfficialPlugin[] = [
    { id: 'github', name: 'GitHub', desc: 'Issues, PRs, code reviews via GitHub MCP', marketplace: 'claude-plugins-official', category: 'Productivity' },
    { id: 'playwright', name: 'Playwright', desc: 'Browser automation and testing', marketplace: 'claude-plugins-official', category: 'Development' },
    { id: 'feature-dev', name: 'Feature Dev', desc: 'Guided feature development workflow', marketplace: 'claude-plugins-official', category: 'Development' },
    { id: 'superpowers', name: 'Superpowers', desc: 'Enhanced capabilities and productivity tools', marketplace: 'claude-plugins-official', category: 'Productivity' },
    { id: 'code-review', name: 'Code Review', desc: 'Automated code review with best practices', marketplace: 'claude-plugins-official', category: 'Development' },
    { id: 'context7', name: 'Context7', desc: 'Up-to-date library documentation and examples', marketplace: 'claude-plugins-official', category: 'Development' },
    { id: 'frontend-design', name: 'Frontend Design', desc: 'UI/UX design assistance and patterns', marketplace: 'claude-plugins-official', category: 'Design' },
    { id: 'figma', name: 'Figma', desc: 'Read Figma designs and components', marketplace: 'claude-plugins-official', category: 'Design' },
    { id: 'sentry', name: 'Sentry', desc: 'Error monitoring and stack trace analysis', marketplace: 'claude-plugins-official', category: 'Monitoring' },
    { id: 'serena', name: 'Serena', desc: 'Semantic code navigation and analysis', marketplace: 'claude-plugins-official', category: 'Development' },
    { id: 'typescript-lsp', name: 'TypeScript LSP', desc: 'TypeScript language server integration', marketplace: 'claude-plugins-official', category: 'Development' },
    // Superpowers marketplace
    { id: 'superpowers@superpowers-marketplace', name: 'Superpowers (Marketplace)', desc: 'Community-enhanced capabilities', marketplace: 'superpowers-marketplace', category: 'Productivity' },
    { id: 'elements-of-style@superpowers-marketplace', name: 'Elements of Style', desc: 'Writing style guidance (Strunk & White)', marketplace: 'superpowers-marketplace', category: 'Writing' },
  { id: 'superpowers-developing-for-claude-code@superpowers-marketplace', name: 'Dev for Claude Code', desc: 'Plugin development toolkit', marketplace: 'superpowers-marketplace', category: 'Development' },
]

const SCOPE_PRIORITY: Record<string, number> = { user: 0, local: 1, project: 2 }

class PluginStore {
  /** Raw plugin list from CLI (may contain duplicates across scopes) */
  _rawPlugins = $state<PluginEntry[]>([])
  marketplaces = $state<MarketplaceEntry[]>([])
  loading = $state(false)

  /**
   * Deduplicated plugins: user scope wins over project/local.
   * Same short name (before @) = same plugin, keep only the highest-priority scope.
   */
  plugins = $derived.by(() => {
    const map = new Map<string, PluginEntry>()
    // Sort: user first, then local, then project — so first seen wins
    const sorted = [...this._rawPlugins].sort(
      (a, b) => (SCOPE_PRIORITY[a.scope] ?? 9) - (SCOPE_PRIORITY[b.scope] ?? 9)
    )
    for (const p of sorted) {
      const short = p.name.split('@')[0]
      if (!map.has(short)) {
        map.set(short, p)
      }
    }
    return [...map.values()]
  })

  /** Installed plugin short names for quick lookup */
  installedNames = $derived(new Set(this.plugins.map((p) => p.name.split('@')[0])))

  /** Full installed names set for exact matching */
  installedFullNames = $derived(new Set(this.plugins.map((p) => p.name)))

  /** Map from short name → PluginEntry for reactive lookups */
  installedMap = $derived.by(() => {
    const m = new Map<string, PluginEntry>()
    for (const p of this.plugins) {
      m.set(p.name, p)
      const short = p.name.split('@')[0]
      if (!m.has(short)) m.set(short, p)
    }
    return m
  })

  async load() {
    this.loading = true
    try {
      const [plugins, marketplaces] = await Promise.all([
        window.zeus.plugin.list(),
        window.zeus.plugin.marketplaceList()
      ])
      this._rawPlugins = plugins
      this.marketplaces = marketplaces
    } catch {
      // Claude Code might not support plugins
    } finally {
      this.loading = false
    }
  }

  async install(name: string, scope: string = 'user'): Promise<boolean> {
    const result = await window.zeus.plugin.install(name, scope)
    if (result.success) {
      await this.load()
    }
    return result.success
  }

  async uninstall(name: string): Promise<boolean> {
    const result = await window.zeus.plugin.uninstall(name)
    if (result.success) {
      await this.load()
    }
    return result.success
  }

  async enable(name: string, scope?: string): Promise<boolean> {
    const result = await window.zeus.plugin.enable(name, scope)
    if (result.success) {
      await this.load()
    }
    return result.success
  }

  async disable(name: string, scope?: string): Promise<boolean> {
    const result = await window.zeus.plugin.disable(name, scope)
    if (result.success) {
      await this.load()
    }
    return result.success
  }

  async addMarketplace(source: string): Promise<boolean> {
    const result = await window.zeus.plugin.marketplaceAdd(source)
    if (result.success) {
      await this.load()
    }
    return result.success
  }

  /** Check if a plugin (by short or full name) is installed */
  isInstalled(id: string): boolean {
    if (this.installedFullNames.has(id)) return true
    const shortName = id.split('@')[0]
    return this.installedNames.has(shortName)
  }

  /** Get the full installed entry for a plugin */
  getInstalled(id: string): PluginEntry | undefined {
    const shortName = id.split('@')[0]
    return this.plugins.find((p) => p.name === id || p.name.startsWith(shortName + '@'))
  }
}

export const pluginStore = new PluginStore()
