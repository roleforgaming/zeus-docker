1. Bug: When I delete a workspace in zeusdock, it is not deleted from the bind mount on the host.
2. Feat: Add a feature to create a template workspace and use it to create new workspaces.
2a. Add an option for claude to set up a workspace template for the user.
3. CRITICAL BUG: Docker container cannot access the necessary creds to add mcps and plugins.
3a. rg -i "plugin.*(install|add|marketplace)" -g "*.{ts,py,js}" | head -20
src/renderer/src/lib/zeus.ts:    marketplaceList: () => invoke("plugin:marketplace-list"),
src/renderer/src/lib/zeus.ts:      invoke("plugin:install", name, scope),
src/renderer/src/lib/zeus.ts:    uninstall: (name: string) => invoke("plugin:uninstall", name),
src/renderer/src/lib/zeus.ts:      invoke("plugin:marketplace-add", source),
src/renderer/src/lib/stores/plugin.svelte.ts:import type { PluginEntry, MarketplaceEntry } from '../types/index.js'
src/renderer/src/lib/stores/plugin.svelte.ts:  { id: 'superpowers-developing-for-claude-code@superpowers-marketplace', n
ame: 'Dev for Claude Code', desc: 'Plugin development toolkit', marketplace: 'superpowers-marketplace', category: 'Development' },                                                                                                              src/renderer/src/lib/stores/plugin.svelte.ts:      const [plugins, marketplaces] = await Promise.all([
src/renderer/src/lib/stores/plugin.svelte.ts:        window.zeus.plugin.marketplaceList()
src/renderer/src/lib/stores/plugin.svelte.ts:    const result = await window.zeus.plugin.install(name, scope)
src/renderer/src/lib/stores/plugin.svelte.ts:    const result = await window.zeus.plugin.uninstall(name)
src/renderer/src/lib/stores/plugin.svelte.ts:    const result = await window.zeus.plugin.marketplaceAdd(source)
src/renderer/src/lib/stores/plugin.svelte.ts:  /** Check if a plugin (by short or full name) is installed */
server/index.js:  socket.on("plugin:marketplace-list", async (cb) =>
server/index.js:  socket.on("plugin:install", async (name, scope, cb) =>
server/index.js:    cb(await runPluginCmd("install", name, scope)),
server/index.js:  socket.on("plugin:uninstall", async (name, cb) =>
server/index.js:    cb(await runPluginCmd("uninstall", name)),
server/index.js:  socket.on("plugin:marketplace-add", async (source, cb) =>
server/index.js:    cb(await runPluginCmd("marketplace add", source)),
server/claude-config.js:    const child = spawn(claudePath, ['plugin', 'marketplace', 'list'], {
