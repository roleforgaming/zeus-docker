# ⚡ Zeus

**The high-performance web terminal built for Claude Code power users.**

Zeus provides a purpose-built interface for Claude Code — featuring a dedicated input bar, workspace management, skill discovery, MCP panel, and integrated IDE — all in one unified environment. Stop juggling terminals and config files. Just open Zeus and code.

![Zeus Interface](assets/zeus-main.png)

---

## Why Zeus?

| Pain point                                                 | Zeus solution                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Typing in a raw terminal feels clunky for AI conversations | **Dedicated input bar** with history, multi-line support, and interrupt controls.           |
| Switching repos means constant `cd`-ing                    | **Sidebar workspace manager** — click to switch contexts instantly.                         |
| Managing `.claude/` skills and MCP servers is tedious      | **Visual Panels** — toggle permissions, add servers, and preview command files.             |
| Reading project docs means leaving the terminal            | **Integrated Docs Browser** — browse and read markdown files as full-width tabs.            |
| Parallel agent activity is hard to track                   | **Subagent Watcher** — real-time tracking of parallel agent tasks via `.trekker/`.          |
| No easy way to open the repo in your IDE                   | **One-click IDE launch** — Integrated with VS Code, Cursor, and a built-in `code-server`.   |

---

## Key Features

### 📂 Workspace Management
Organize your projects with a dedicated sidebar. Switch contexts instantly without losing your terminal history or Claude session state. Zeus remembers your workspaces and their order.

### 🛠️ Integrated Tooling Panel
Access your Skills, MCP servers, and Documentation in a unified right panel.
- **Skills**: Manage and preview your available Claude skills (global and project-scoped).
- **MCP**: Configure, monitor, and install Model Context Protocol servers.
- **Docs**: Browse and read project documentation with high-quality rendering.

### 🤖 Subagent Tracking
Real-time visibility into parallel agent activity. See what your subagents are doing, their status, and tool usage as it happens.

### 🎨 Premium Experience
- **Svelte 5 + WebGL**: GPU-accelerated terminal rendering (via xterm.js) and a reactive, zero-VDB UI.
- **Themes**: Default Claude Code dark mode, warm Anthropic light theme, and refined dark themes.
- **Bi-directional RPC**: Seamless communication via Socket.IO for low-latency terminal and chat streaming.

---

## Architecture

Zeus is built as a Server-Client application:
- **Backend (Node.js/Express/Socket.IO)**: Manages PTY sessions, file I/O, Git operations, and Claude CLI interactions.
- **Frontend (Svelte 5/Vite)**: A high-performance web interface that communicates with the backend via bi-directional Socket.IO events.

---

## Getting Started

### 🐳 Docker Deployment (Recommended)
The unified Docker container bundles the Zeus backend, the built frontend, the Claude Code CLI, and `code-server` (VS Code in the browser).

```bash
docker compose up --build
```

Access clinical endpoints:
- **Zeus Web Terminal**: [http://localhost:3000](http://localhost:3000)
- **code-server IDE**: [http://localhost:8081](http://localhost:8081)

**Configuration:**
- **Workspaces**: Mounted from `./workspaces` on the host to `/home/coder/workspaces`.
- **Persistence**: Zeus state is saved in the `zeus-data` volume.
- **User**: Runs as a non-root `coder` user (UID 1000).

**Environment Variables:**

| Variable | Default | Description |
|---|---|---|
| `CODE_SERVER_URL` | `http://localhost:8081` | Public URL for code-server IDE. Set to your domain when using a reverse proxy or Cloudflare tunnel (e.g., `https://code.yourdomain.com`). |
| `PASSWORD` | *(required)* | Password to access code-server IDE. |

### 🛠️ Local Development

#### 1. Install Dependencies
```bash
# Install root (client) dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..
```

#### 2. Run in Development Mode
```bash
npm run dev
```
This starts Vite (frontend) and Express (backend) concurrently. Vite handles HMR and proxies Socket.IO connections to the backend.

#### 3. Production Build & Start
```bash
# Build the Svelte frontend
npm run build

# Start the Express server
npm run start
```

---

## Keyboard Shortcuts

| Shortcut           | Action                                   |
| ------------------ | ---------------------------------------- |
| `Cmd+T`            | New terminal tab                         |
| `Cmd+Shift+C`      | Launch Claude Code                       |
| `Cmd+B`            | Toggle sidebar                           |
| `Cmd+I`            | Toggle right panel (Skills / MCP / Docs) |
| `Cmd+K`            | Clear terminal output                    |
| `Cmd+W`            | Close current tab                        |
| `Enter`            | Send input                               |
| `Shift+Enter`      | New line in input                        |
| `↑` / `↓`          | Navigate command history                 |
| `Ctrl+C`           | Send interrupt (SIGINT)                  |
| `Ctrl+D`           | Send EOF / Close session                 |
| `Middle-click tab` | Close tab                                |

---

## Design Credits
- **Colors**: Refined palettes optimized for developer focus.
- **Typography**: D2Coding for monospace (monospaced with ligatures); Pretendard for UI text.
- **Engine**: Powered by `node-pty` for authentic terminal behavior.

---

## License

MIT
