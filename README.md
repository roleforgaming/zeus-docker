# ⚡ ZeusDock

**A self-hosted web workspace for Claude Code with integrated IDE, workspace management, and remote access.**

ZeusDock is a Docker-based web application that brings Claude Code to your browser. It provides a purpose-built interface for Claude Code — featuring a dedicated input bar, workspace management, skill discovery, MCP panel, and integrated VS Code (via code-server) — all in one unified environment. Stop juggling terminals and config files. Just open ZeusDock and code.

> **Note**: ZeusDock is a Docker-based reimagining of the original [Zeus project](https://github.com/trustspirit/zeus) (an Electron desktop app). This fork adds Docker containerization and code-server IDE integration for remote access while preserving the core application under the original MIT license.
>
> ⚠️ **Disclaimer**: This implementation is completely vibe-coded with Claude Code. It works well but was built interactively with an AI assistant. Review the code and test thoroughly in your environment before deploying to production.

![Zeus Interface](assets/zeus-main.png)

---

## Why I Built This

I really loved the Zeus GUI, but I didn't love that it was confined to desktop. I'm constantly on the go with my kids and wanted a reliable way to access Zeus from my laptop or even my phone. Additionally, I didn't want to rely on local IDEs while on my laptop and I wanted an easy way to access my projects in a browser-based IDE, thus the code-server integration.

I have severe ADHD and "out of sight, out of mind". My file explorer on my desktop is a hot mess and it's difficult to keep track of my projects. With Zeus, all of my workspaces are right there, literally two clicks away. Now, with ZeusDock, they all travel with me too. This started as just personal software for myself, but I could see a real use case and thought I would share it.

---

## Why ZeusDock?

### For Self-Hosters

| Goal                                              | ZeusDock solution                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Access Claude Code from anywhere (remotely)      | **Single Docker container** with web UI — no SSH tunnels, just HTTPS + reverse proxy.       |
| Manage multiple project workspaces                | **Sidebar workspace manager** — switch contexts instantly. Workspaces persist across visits. |
| Run Claude Code with integrated IDE              | **Built-in code-server** (VS Code in browser) and **Claude terminal** side-by-side.         |
| Manage `.claude/` skills and MCP servers visually | **Visual Panels** — toggle permissions, add servers, and preview command files.             |
| No complex setup or external dependencies         | **Environment variables only** — just set `PASSWORD` and optionally `CODE_SERVER_URL`.      |
| Real-time visibility into agent activity         | **Subagent Watcher** — track parallel agent tasks as they run.                             |

---

## Key Features

### 📂 Workspace Management
Organize your projects with a dedicated sidebar. Switch contexts instantly without losing your terminal history or Claude session state. ZeusDock remembers your workspaces and their order.

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

ZeusDock is built as a Server-Client application:
- **Backend (Node.js/Express/Socket.IO)**: Manages PTY sessions, file I/O, Git operations, and Claude CLI interactions.
- **Frontend (Svelte 5/Vite)**: A high-performance web interface that communicates with the backend via bi-directional Socket.IO events.
- **Docker Container**: Bundles the ZeusDock backend, frontend, Claude Code CLI, and code-server for unified deployment.

---

## Getting Started

### 🐳 Docker Deployment

The unified Docker container bundles:
- **ZeusDock backend** (Express + Socket.IO)
- **ZeusDock frontend** (Svelte 5 web UI)
- **Claude Code CLI** (for local terminal execution)
- **code-server** (VS Code in the browser)

#### 1. Quick Start

Clone this repository and start:

```bash
git clone <this-repo>
cd zeus

# Copy the example environment file (or create your own)
cp .env.example .env

# Edit .env to set your password and optional custom domain
# Then start:
docker compose up --build
```

#### 2. Access ZeusDock

- **ZeusDock Web Terminal**: [http://localhost:3000](http://localhost:3000)
- **code-server IDE**: [http://localhost:8081](http://localhost:8081)

#### 3. Configuration

**Workspace Mounting:**
- Workspaces are mounted from `./workspaces` (on your host) to `/home/coder/workspaces` inside the container.
- Add project folders to `./workspaces/` on your host, and they'll appear in ZeusDock's sidebar.

**Data Persistence:**
- ZeusDock state (workspace list, preferences) is saved in the `zeus-data` Docker volume.
- Terminal history and Claude sessions persist between container restarts.

**User & Security:**
- Runs as a non-root `coder` user (UID 1000) for security.
- code-server is password-protected via the `PASSWORD` environment variable.

**Environment Variables:**

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PASSWORD` | — | **Yes** | Password to access code-server IDE. Set this for security. |
| `CODE_SERVER_URL` | `http://localhost:8081` | No | Public URL for code-server. Set to your domain when using a reverse proxy or Cloudflare tunnel (e.g., `https://code.yourdomain.com`). This URL is used in the ZeusDock UI to link to the IDE. |

Example `.env`:
```bash
PASSWORD=your-secure-password-here
CODE_SERVER_URL=https://code.yourdomain.com
```

#### 4. Prerequisites for Remote Access

Before exposing ZeusDock to the internet, set up secure authentication:

**Recommended: Cloudflare Zero Trust + OAuth**

Use Cloudflare Zero Trust to tunnel ZeusDock securely with built-in access policies and OAuth support:

1. **Set up Cloudflare Zero Trust** ([docs](https://developers.cloudflare.com/cloudflare-one/))
2. **Configure Access Policies** with your preferred OAuth provider
3. **Example: Using Pocket ID** for self-hosted OAuth:
   - Follow [Pocket ID + Cloudflare Zero Trust guide](https://pocket-id.org/docs/client-examples/cloudflare-zero-trust)
   - Route both ZeusDock and code-server through Zero Trust
   - Users authenticate via Pocket ID before accessing either service

This approach provides:
- ✅ End-to-end encryption (Cloudflare managed)
- ✅ OAuth/OIDC authentication (Pocket ID or other providers)
- ✅ Granular access policies
- ✅ No port forwarding needed

#### 5. Alternative Remote Access Options

If you prefer not to use Zero Trust:

**Option A: Cloudflare Tunnel (Simple, less secure)**
```bash
# Inside the container or on your host, run:
cloudflared tunnel --url http://localhost:3000
cloudflared tunnel --url http://localhost:8081

# Share the generated tunnel URLs (anyone with the URL can access)
# Protect with CODE_SERVER_URL password
```

**Option B: Reverse Proxy (Nginx/Caddy)**
- Route `https://zeusdom.yourdomain.com` → `http://localhost:3000`
- Route `https://code.yourdomain.com` → `http://localhost:8081`
- Add authentication at the reverse proxy level (OAuth2 proxy, etc.)
- Update `CODE_SERVER_URL` in `.env` accordingly

**Option C: SSH Tunnel (Secure for personal use)**
```bash
ssh -L 3000:localhost:3000 -L 8081:localhost:8081 user@host
# Then access http://localhost:3000 locally
```

### 🛠️ Local Development (Optional)

If you want to contribute or run ZeusDock outside Docker, refer to the [original Zeus repository](https://github.com/trustspirit/zeus#) for detailed local development instructions.

This fork preserves the original development workflow — only Docker configuration and code-server integration were added.

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

## Roadmap / To-Do

Planned features and improvements for ZeusDock:

- **File Reveal**: Currently there is a leftover from Zeus, the "Reveal in Finder" folder button. It is nonfunctional and I am not certain I am going to implement it.
- **Notes/Planner**: A non-workspace view for tracking running ideas, quick notes, and things you'd like to do

---

## Troubleshooting

**Q: Password is asking for code-server, but how do I authenticate with Claude Code?**
A: Claude Code uses its own authentication flow via the browser. You'll log in to Claude Code within the ZeusDock terminal when you run the `claude login` command. The `PASSWORD` is only for code-server access.

**Q: How do I add an existing project/workspace?**
A: Add project folders to the `./workspaces/` directory on your host machine. They'll appear in ZeusDock's sidebar after a refresh or page reload.

**Q: Can I use my own reverse proxy instead of Cloudflare Tunnel?**
A: Yes. Configure your reverse proxy (nginx, Caddy, etc.) to route traffic to `http://localhost:3000` and `http://localhost:8081`, then update `CODE_SERVER_URL` in your `.env`.

**Q: How do I update ZeusDock to the latest version?**
A: Pull the latest changes from this repository, then run `docker compose up --build` again.

---

## Credits & Attribution

**Original Project**: [Zeus](https://github.com/trustspirit/zeus) by [trustspirit](https://github.com/trustspirit) — an Electron desktop app for Claude Code.

**This Fork**: Refactored for Docker containerization and added code-server IDE integration to enable remote access. The core application logic and UI remain faithful to the original design.

---

## License

MIT (see LICENSE file for details)
