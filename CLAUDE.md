# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zeus is a high-performance web-based terminal for Claude Code — combining an Express + Socket.IO backend with a Svelte 5 frontend. It provides workspace management, chat interface, terminal tabs, Skills/MCP panels, and IDE integration (code-server).

The Docker-based architecture bundles the Zeus backend, frontend, Claude Code CLI, and code-server into a single container for unified deployment.

## Session Startup Protocol

1. Identify the domain of your task: **Frontend** (Svelte stores/components), **Backend** (Node.js handlers), **Communication** (Socket.IO events), **Tests** (Playwright), or **Infra** (Docker/CLI tooling).
2. Before opening many files, check `docs/` or `docs/summaries/` for existing architecture/feature overviews.
3. Use code search (ripgrep or MCP search tools) to locate symbols, events, or components.
4. Navigate by domain:
   - **Store/state issues**: Start in `src/renderer/src/lib/stores/` — each store owns a domain and calls Zeus API methods.
   - **Backend logic**: Start in `server/index.js` (event hub) → follow to specialist modules like `claude-session.js`, `terminal.js`.
   - **Socket.IO communication**: Trace the event name in both `server/index.js` and the corresponding store.
   - **UI changes**: Look at existing tests in `tests/` before modifying behavior — update/add tests to match.

## Development Commands

```bash
# Install dependencies (frontend + backend)
npm install
cd server && npm install && cd ..

# Development (Vite on port 5173, Express on port 3000)
npm run dev

# Production build and start
npm run build       # Vite builds → dist/renderer/
npm run start       # Build + run server

# E2E Tests (Playwright, sequential, 1 worker)
npx playwright test
npx playwright test --ui                      # Interactive mode
npx playwright test tests/terminal.spec.ts    # Single test file

# Type checking
svelte-check
```

**Notes:**
- Vite proxies `/socket.io` to port 3000 in dev mode.
- No separate lint script; use `svelte-check` and TypeScript for static analysis.

## Architecture Essentials

### Frontend (Svelte 5 + Vite)

All app state lives in `src/renderer/src/lib/stores/` as reactive modules.

**Key stores (by domain):**
- `claude.svelte.ts` — Claude sessions, streaming, tab management
- `claude-session.svelte.ts` — Session history and persistence
- `workspace.svelte.ts` — Workspace list, selection, persistence
- `terminal.svelte.ts` — PTY terminal state per tab
- `ui.svelte.ts` — Sidebar/panel visibility, modals
- `mcp.svelte.ts` — MCP server status and config
- `skills.svelte.ts` — Custom commands discovery
- `ide.svelte.ts`, `plugin.svelte.ts`, `markdown.svelte.ts` — IDE integration, plugins, markdown

**Pattern:** Stores emit Socket.IO events → backend handlers call specialist modules → callbacks or events update client state. No REST API.

### Backend (Express + Socket.IO)

Central hub: `server/index.js` (~560 lines) — all Socket.IO event handlers live here.

**Specialist modules:**
- `index.js` — event hub (all Socket.IO handlers)
- `claude-session.js` — spawns `claude` CLI as PTY, streams output line-by-line
- `terminal.js` — user command PTY, shell spawning
- `claude-config.js` — reads/writes `~/.claude/claude.json` and MCP config
- `files.js` — git operations, markdown listing, file I/O
- `skills.js` — scans `~/.claude/commands/` and `.claude/commands/` for custom skills
- `store.js` — in-memory JSON persistence (workspaces, preferences) flushed to disk
- `subagent-watcher.js` — watches `.trekker/` for parallel agent activity

**Socket.IO pattern:** Client emits event → `index.js` handler → calls specialist module → sends response/broadcast back.

### Communication Flows

- **Terminal rendering**: `node-pty` spawns PTY → streams `terminal:data` events → xterm.js + WebGL addon renders in browser
- **Claude session flow**: InputBar → `claude-session:send` event → backend spawns `claude [--resume id]` PTY → output streamed → frontend parses into `ClaudeConversation` with typed content blocks
- **State sync**: Stores call API methods (typed by `ZeusAPI`) → Socket.IO events → backend handlers → responses update reactive state

### Key Types

Location: `src/renderer/src/lib/types/index.ts`

- `Workspace` — project directory entry (path, name, timestamps)
- `ClaudeConversation` — active chat session with messages, streaming state, pending prompts, subagent tracking
- `ClaudeMessage` / `ContentBlock` — streaming chat content (text, tool_use, tool_result, thinking)
- `TerminalSession` — PTY state with command history
- `SubagentInfo` — parallel agent task tracking (name, color, status, tools)
- `CustomSkill` — slash command/skill metadata (name, path, scope, category)
- `ZeusAPI` — complete browser↔backend RPC interface (all Socket.IO method signatures)

**When changing core domain behavior, update these types first, then adjust stores and backend handlers to match.**

## Tests

Type: E2E only (Playwright). All tests are sequential, 1 worker.

- **Location**: `tests/` — split by domain: `app-shell.spec.ts`, `conversation.spec.ts`, `terminal.spec.ts`, `sidebar.spec.ts`
- **Helpers**: `tests/helpers/app.ts` — `loadApp()` waits for Socket.IO WebSocket handshake and app mount
- **Config**: `playwright.config.ts` — baseURL `http://localhost:3000`, 45s timeout, trace retention on failure

When modifying UI flows or Socket.IO wiring, update/add tests in the matching spec file.

## Docker Deployment

### Container Architecture

Single `app` service with:
- **Base image**: `codercom/code-server:latest` (includes code-server + base tooling)
- **Build stage**: Vite builds Svelte frontend → multi-stage copies `dist/renderer/` + `server/`
- **Runtime**: Node 20, Python 3, `make`, `g++` for build dependencies
- **User**: Non-root `coder` user (UID 1000) for security isolation
- **Ports**:
  - 3000 (Zeus Express + Socket.IO backend)
  - 8080 (code-server IDE, exposed as 8081 on host)
- **Volumes**: `./workspaces:/home/coder/workspaces` (workspace mounting)
- **Entrypoint**: `/entrypoint.sh` (manages Claude CLI and service startup)

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PASSWORD` | — | **Yes** | Password to access code-server IDE |
| `CODE_SERVER_URL` | `http://localhost:8081` | No | Public URL for code-server (set for reverse proxy/tunnel scenarios) |

### Running

```bash
docker compose up --build
```

Access:
- Zeus: http://localhost:3000
- code-server IDE: http://localhost:8081

Use Docker to validate production-like behavior (CLI installation, PTY behavior, Socket.IO endpoints) beyond local dev.

## Common Patterns

### Frontend Store Pattern

Each store exposes reactive state (`$state`, `$derived`) plus synchronous Socket.IO event methods that emit to the backend:

```typescript
export const myStore = $state({
  data: [] as MyType[],
  loading: false,
});

export function updateData(newData: MyType[]) {
  zeus.emit('my-event:update', newData, (response) => {
    myStore.data = response;
  });
}
```

### Backend Event Handler Pattern

In `server/index.js`, receive events, call specialist modules, and respond:

```javascript
socket.on('my-event:update', async (payload, callback) => {
  try {
    const result = await myModule.update(payload);
    callback({ success: true, data: result });
  } catch (error) {
    callback({ success: false, error: error.message });
  }
});
```

### Immutability in Stores

Always create new objects, never mutate existing ones. Use spread operators or `structuredClone`:

```typescript
// ✓ Correct
myStore.items = [...myStore.items, newItem];

// ✗ Wrong
myStore.items.push(newItem);
```
