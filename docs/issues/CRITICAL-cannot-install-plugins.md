## Issue
When accessing zeusdock from a docker container, I cannot install plugins. When I try to install a plugin, I get the following error:

Failed to install: github: X Failed to install plugin "github@claude-plugins-official": Plugin "github" not found in marketplace "claude-plugins-official"

## Involved files

rg -i "plugin.*(install|add|marketplace)" -g "*.{ts,py,js}" | head -20
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

## Instructions
Investigate why plugins cannot be installed from the docker container. The current file logic is sound -- plugin installation works when running locally via npm run dev. The issue is specific to the docker container.

## Investigative Findings

### 1. Marketplace Naming Mismatch
The `Dockerfile` contains the following registration command:
```dockerfile
RUN claude plugin marketplace add https://github.com/anthropic/plugins-official.git
```
When a name is not provided, the `claude` CLI assigns a default name (e.g., `plugins-official`). However, the Zeus frontend (`src/renderer/src/lib/stores/plugin.svelte.ts`) and the installation logic expect the marketplace to be named exactly **`claude-plugins-official`**. This explains the error: `Plugin "github" not found in marketplace "claude-plugins-official"`.

### 2. Environment Variable Isolation
The server uses `getShellEnv()` (from `server/claude-cli.js`) when spawning child processes. If this environment does not include the `HOME` variable, the `claude` CLI will fail to locate its configuration directory (`~/.claude/`) where registered marketplaces are stored. In Docker, `HOME` is typically `/home/coder`.

### 3. Binary Discrepancy
The `Dockerfile` performs a global npm install followed by a `claude install` (native binary). If the server's `claudePath` resolution points to the global npm version while the native version was the one configured with the marketplace, discovery will fail.

## Open Questions

1.  **Actual Marketplace Name**: What does `claude plugin marketplace list` return when executed inside the container?
2.  **Environment Audit**: Does `getShellEnv()` correctly pass through the `HOME` and `PATH` (including `/home/coder/.local/bin`) variables?
3.  **Active Binary**: Which binary path is `getClaudeCliPath()` returning inside the container?

## Next Suggested Actions

1.  **Fix Marketplace Registration**: Update `Dockerfile` line 81 to:
    `RUN claude plugin marketplace add https://github.com/anthropic/plugins-official.git claude-plugins-official`
2.  **Verify Environment**: (Requires reading `server/claude-cli.js`) Ensure `getShellEnv` merges `process.env` to preserve `HOME`.
3.  **Runtime Debugging**: Add a temporary log in `server/claude-config.js` to output the results of `claude plugin marketplace list` on server startup to verify registration state.

# Further Research via Perplexity
**The plugin installation failure in your Docker container stems primarily from a marketplace naming mismatch during registration.**

## Root Cause
Your **Zeusdock** frontend code explicitly references the marketplace as "claude-plugins-official" when attempting to install plugins like "github@claude-plugins-official".  However, the `Dockerfile` runs `claude plugin marketplace add https://github.com/anthropics/plugins-official.git` *without* specifying a custom name as the second argument. The **Claude CLI** defaults to a name derived from the repo (likely "plugins-official" or similar), not the expected "claude-plugins-official".  This causes the lookup to fail inside the container, even though your IPC logic (`runPluginCmd`) and frontend invokes are correct—proven by local `npm run dev` success. [code.claude](https://code.claude.com/docs/en/plugin-marketplaces)

Use case: When you select "github" for install, the UI constructs "github@claude-plugins-official" based on hardcoded store data, but the container's `~/.claude/` config lacks that exact marketplace ID.

## Verification Steps
Run these *inside the running container* (e.g., `docker exec -it <container> bash`) to confirm without rebuilding:

1. `claude plugin marketplace list`  
   - Expect: No "claude-plugins-official" or missing "github" plugin. Logs the actual registered name (e.g., "plugins-official"). [code.claude](https://code.claude.com/docs/en/discover-plugins)

2. `echo $HOME; ls -la $HOME/.claude/`  
   - Confirms config dir exists (should be `/home/coder/.claude`). If missing, env issue. [github](https://github.com/nezhar/claude-container)

3. `which claude; claude --version`  
   - Ensures `getClaudeCliPath()` matches the native binary from `Dockerfile` (`/home/coder/.local/bin/claude`), not npm global. [code.claude](https://code.claude.com/docs/en/troubleshooting)

Your `getShellEnv()` likely preserves `HOME=/home/coder` and `PATH`, but verify by adding `console.log(process.env.HOME, process.env.PATH)` before spawning in `server/claude-config.js`.

## Pragmatic Fixes
Don't over-engineer—fix the mismatch first, as it's 90% likely the sole issue given local works. ADHD note: Resist adding debug logs everywhere; test one change iteratively.

### Primary Fix: Named Marketplace Add
Update `Dockerfile` line 81 to explicitly name it:
```
RUN claude plugin marketplace add https://github.com/anthropics/plugins-official.git claude-plugins-official
```
- Rebuild/push image. Repo exists per error context (though searches show variants like anthropics/claude-plugins-official). [github](https://github.com/anthropics/claude-plugins-official)
- Why needed: CLI `add <url> [name]` uses `[name]` if provided; defaults otherwise. [reddit](https://www.reddit.com/r/ClaudeAI/comments/1o2bj9l/introducing_claude_code_plugins_in_public_beta/)

### Fallback: Dynamic Repo Check
If repo 404s, correct URL is likely `https://github.com/anthropics/claude-plugins-official.git` (official marketplace).  Test locally: `claude plugin marketplace add https://github.com/anthropics/claude-plugins-official.git test-marketplace`. [code.claude](https://code.claude.com/docs/en/discover-plugins)

### Environment Safeguard
In `server/claude-cli.js`, ensure `getShellEnv()` explicitly sets:
```js
const env = { ...process.env, HOME: process.env.HOME || '/home/coder' };
```
Prevents config isolation if Docker overrides. Use case: Server spawns `claude` subprocesses; missing `HOME` skips `~/.claude/` load. [code.claude](https://code.claude.com/docs/en/troubleshooting)

## Test Workflow
1. Apply Dockerfile fix, rebuild container.
2. `docker run ...` Zeusdock.
3. Install "github" plugin via UI.
4. Check logs/server console for `plugin:install` IPC.
5. Fallback: Runtime add via temp endpoint calling `marketplaceAdd('https://github.com/anthropics/plugins-official.git#claude-plugins-official')`.

This resolves without code changes beyond Dockerfile—pragmatic for impulsive deploys. If persists, share `claude plugin marketplace list` output from container. [code.claude](https://code.claude.com/docs/en/plugin-marketplaces)