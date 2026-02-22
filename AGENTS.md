# Project

Zeus is a high‑performance desktop terminal for Claude Code — a local Express + Socket.IO server with a Svelte 5 frontend that provides workspace management, chat interface, terminal tabs, Skills/MCP panels, and IDE integration.

***

## Session Startup Protocol

1. Identify the domain of the task: **Frontend** (Svelte stores/components), **Backend** (Node.js handlers), **Communication** (Socket.IO events), **Tests** (Playwright), or **Infra** (Docker/CLI tooling).  
2. Before opening many files, check for any relevant docs under `docs/` or `docs/summaries/` (e.g. architecture/feature overviews) and read those first.  
3. Use code search (ripgrep or MCP search tools) to locate symbols, events, or components; do *not* manually scan entire directories.  
4. For store/state issues, start in `src/renderer/src/lib/stores/` — each store owns a domain and calls Zeus API methods.  
5. For backend logic, start in `server/index.js` (event hub) and follow to specialist modules like `claude-session.js`, `terminal.js`, etc.  
6. For Socket.IO communication, trace the event name in both `server/index.js` and the corresponding store.  
7. Look at existing tests in `tests/` before adding new functionality, and update/add tests when changing observable behavior.

***

## Project Tree
.
├── AGENTS.md
├── CLAUDE.md
├── Dockerfile
├── README.md
├── assets
│   ├── right-panel.png
│   ├── settings.png
│   └── zeus-main.png
├── dev.log
├── dev.pid
├── docker-compose.yml
├── docs
│   ├── archive
│   │   └── handoffs
│   └── summaries
├── package-lock.json
├── package.json
├── playwright.config.ts
├── resources
│   ├── icon.icns
│   ├── icon.ico
│   ├── icon.png
│   └── icon.svg
├── server
│   ├── claude-cli.js
│   ├── claude-config.js
│   ├── claude-session.js
│   ├── files.js
│   ├── ide.js
│   ├── index.js
│   ├── package-lock.json
│   ├── package.json
│   ├── skills.js
│   ├── store.js
│   ├── subagent-watcher.js
│   └── terminal.js
├── src
│   └── renderer
│       ├── index.html
│       └── src
├── svelte.config.js
├── test-results
├── tests
│   ├── app-shell.spec.ts
│   ├── conversation.spec.ts
│   ├── helpers
│   │   └── app.ts
│   ├── ide.spec.ts
│   ├── sidebar.spec.ts
│   └── terminal.spec.ts
├── tsconfig.json
├── tsconfig.web.json
└── vite.config.ts

14 directories, 40 files

***

## Commands

```bash
# Install
npm install
cd server && npm install && cd ..

# Development (concurrent: Vite on 5173 + Express on 3000)
npm run dev

# Production
npm run build       # Vite → dist/renderer/
npm run start       # Build + Express

# E2E Tests (sequential, 1 worker)
npx playwright test
npx playwright test --ui                     # Interactive mode
npx playwright test tests/terminal.spec.ts   # Single test file
```

Notes:

- Vite proxies `/socket.io` to port 3000 in dev mode.  
- No lint script; use `svelte-check` and TypeScript for static checks as needed.  

***

## Architecture

### Frontend

Stack: Svelte 5 + Vite. All app state lives in `src/renderer/src/lib/stores/` as reactive modules. Entry point: `src/renderer/src/main.ts` → `App.svelte`.

Key directories:

- `lib/stores/` — reactive modules:  
  - `claude.svelte.ts`, `claude-session.svelte.ts` — Claude sessions, streaming, tabs, history.  
  - `workspace.svelte.ts` — workspace list, selection, persistence.  
  - `terminal.svelte.ts` — PTY terminal state per tab.  
  - `ui.svelte.ts` — sidebar/panel visibility, modals.  
  - `mcp.svelte.ts` — MCP server status and config.  
  - `skills.svelte.ts` — custom commands discovery.  
  - `ide.svelte.ts`, `plugin.svelte.ts`, `markdown.svelte.ts` — IDE integration, plugins, markdown.  
- `lib/components/` — Svelte components (InputBar, ChatFlow, TerminalPanel, SettingsPanel, etc.).  
- `lib/types/` — central type definitions (see Key Types).  
- `lib/zeus.ts` — Socket.IO client init, shared across stores via import.

Pattern: stores emit Socket.IO events → backend handlers call specialist modules → callbacks or events update client state. No REST API.

### Backend

Stack: Express + Socket.IO (Node.js). Central hub: `server/index.js` (~560 lines) — all Socket.IO event handlers live here. Specialist modules handle specific domains.

Key files:

- `index.js` — event hub (all Socket.IO handlers).  
- `claude-session.js` — spawns `claude` CLI as PTY, streams output line‑by‑line.  
- `terminal.js` — user command PTY, shell spawning.  
- `claude-config.js` — reads/writes `~/.claude/claude.json` and MCP config.  
- `files.js` — git operations, markdown listing, file I/O.  
- `skills.js` — scans `~/.claude/commands/` and `.claude/commands/` for custom skills.  
- `store.js` — in‑memory JSON persistence (workspaces, preferences) flushed to disk.  
- `subagent-watcher.js` — watches `.trekker/` for parallel agent activity.

Socket.IO pattern: client emits event → `index.js` handler → calls specialist module → sends response/broadcast back.

***

## Communication

- **Terminal rendering**: `node-pty` spawns PTY → streams `terminal:data` events → xterm.js + WebGL addon renders in the browser.  
- **Claude session flow**: InputBar → `claude-session:send` event → backend spawns `claude [--resume id]` PTY → output streamed → frontend parses into `ClaudeConversation` with typed content blocks.  
- **State sync**: stores call API methods (typed by `ZeusAPI`) → Socket.IO events → backend handlers → responses update reactive state.

***

## Key Types

Location: `src/renderer/src/lib/types/index.ts`:

- `Workspace` — project directory entry (path, name, timestamps).  
- `ClaudeConversation` — active chat session with messages, streaming state, pending prompts, subagent tracking.  
- `ClaudeMessage` / `ContentBlock` — streaming chat content (text, tool_use, tool_result, thinking).  
- `TerminalSession` — PTY state with command history.  
- `SubagentInfo` — parallel agent task tracking (name, color, status, tools).  
- `CustomSkill` — slash command/skill metadata (name, path, scope, category).  
- `ZeusAPI` — complete browser↔backend RPC interface (all Socket.IO method signatures).

When changing core domain behavior, update these types first, then adjust stores and backend handlers to match.

***

## Frontend Stores

Each store owns a domain and exposes reactive state + Socket.IO methods:

| Store                      | Domain                                           |
|----------------------------|--------------------------------------------------|
| `claude.svelte.ts`         | Claude sessions, streaming, tab management       |
| `claude-session.svelte.ts` | Session history and persistence                  |
| `workspace.svelte.ts`      | Workspace list, selection, persistence           |
| `terminal.svelte.ts`       | PTY terminal state per tab                       |
| `ui.svelte.ts`             | Sidebar/panel visibility, modals                 |
| `mcp.svelte.ts`            | MCP server status and config                     |
| `skills.svelte.ts`         | Custom commands discovery                        |

Navigation rule:

- Start from the relevant store for the feature you’re changing, then locate the corresponding components and backend events (`ZeusAPI` type + `server/index.js` handlers).

***

## Tests

Type: E2E only (Playwright). All tests are sequential, 1 worker.

- Location: `tests/` — split by domain: `app-shell.spec.ts`, `conversation.spec.ts`, `terminal.spec.ts`, `sidebar.spec.ts`.  
- Helpers: `tests/helpers/app.ts` — `loadApp()` waits for Socket.IO WebSocket handshake and app mount.  
- Config: `playwright.config.ts` — `baseURL` `http://localhost:3000`, 45s timeout, trace retention on failure.

When modifying UI flows or Socket.IO wiring, update/add tests in the matching spec file.

***

## Docker

Unified container architecture combining Zeus backend, code-server IDE, and Claude Code CLI.

### Container Architecture

Single `app` service with:
- **Base image**: `codercom/code-server:latest` (includes code-server + base tooling)
- **Build stage**: Vite builds Svelte frontend → multi‑stage copies `dist/renderer/` + `server/`
- **Runtime**: Node 20, Python 3, `make`, `g++` for build dependencies
- **User**: Non-root `coder` user (UID 1000) for security isolation
- **Ports**:
  - 3000 (Zeus Express + Socket.IO backend)
  - 8080 (code-server IDE, exposed as 8081 on host)
- **Volumes**: `./workspaces:/home/coder/workspaces` (workspace mounting)
- **Entrypoint**: `/entrypoint.sh` (manages Claude CLI and service startup)

### Environment Variables

```
PORT=3000
NODE_ENV=production
PATH="/home/coder/.local/bin:${PATH}"
```

The `PATH` includes `~/.local/bin` for the Claude Code CLI installation.

### Running in Docker

```bash
docker compose up --build
```

Access:
- Zeus: http://localhost:3000
- code-server IDE: http://localhost:8081

Use Docker to validate production‑like behavior (CLI installation, PTY behavior, Socket.IO endpoints) beyond the dev setup.

***