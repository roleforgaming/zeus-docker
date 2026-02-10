# Zeus

A high-performance terminal application built for **Claude Code** users. Zeus provides a Ghostty-like terminal experience with workspace management, one-click Claude Code launching, auto-updates, and IDE integration.

## Architecture

Zeus is built with a performance-first stack:

- **Svelte 5** — Compiled UI framework with zero virtual DOM overhead. Components compile to surgical DOM updates via runes (`$state`, `$derived`, `$effect`).
- **TypeScript** — End-to-end type safety across main process, preload, and renderer.
- **electron-vite** — Fast Vite-based build pipeline with tree-shaking and HMR for development.
- **xterm.js + WebGL** — GPU-accelerated terminal rendering.
- **node-pty** — Native pseudo-terminal backend for true shell integration.

## Features

- **GPU-Accelerated Terminal** — WebGL-rendered terminal with 256-color and true-color support
- **Claude Code Integration** — Launch Claude Code with one click or `Cmd+Shift+C`
- **Workspace Management** — Add, switch, and persist repository workspaces in the sidebar
- **Auto-Update Claude Code** — Update Claude Code to the latest version from within the app
- **Open in IDE** — Open workspaces in VS Code, Cursor, Zed, IntelliJ, Windsurf, and more
- **Tabbed Terminals** — Multiple terminal sessions with tab switching
- **Context Menus** — Right-click workspaces for quick actions
- **macOS Native Feel** — Hidden title bar with traffic lights, vibrancy effects

## Getting Started

```bash
# Install dependencies
npm install

# Development (with hot module replacement)
npm run dev

# Production build + preview
npm run build && npm start
```

## Requirements

- **Node.js** 18+
- **Claude Code** — `npm install -g @anthropic-ai/claude-code`

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+T` | New terminal |
| `Cmd+Shift+C` | Run Claude Code |
| `Cmd+B` | Toggle sidebar |
| `Cmd+K` | Clear terminal |

## Project Structure

```
src/
├── main/              # Electron main process (TypeScript)
│   └── index.ts       # Window management, IPC handlers, PTY, store
├── preload/           # Preload bridge (TypeScript)
│   └── index.ts       # xterm.js management, typed contextBridge API
└── renderer/          # Svelte 5 + TypeScript UI
    ├── index.html
    └── src/
        ├── main.ts            # Entry point
        ├── App.svelte         # Root component, action orchestration
        └── lib/
            ├── components/    # Svelte 5 components
            │   ├── Sidebar.svelte
            │   ├── Toolbar.svelte
            │   ├── TabBar.svelte
            │   ├── TerminalArea.svelte
            │   ├── WelcomeScreen.svelte
            │   ├── StatusBar.svelte
            │   ├── IDEModal.svelte
            │   ├── UpdateModal.svelte
            │   ├── ContextMenu.svelte
            │   ├── Toast.svelte
            │   ├── WorkspaceItem.svelte
            │   └── icons/     # SVG icon components
            ├── stores/        # Svelte 5 rune-based stores
            │   ├── workspace.svelte.ts
            │   ├── terminal.svelte.ts
            │   ├── claude.svelte.ts
            │   ├── ide.svelte.ts
            │   └── ui.svelte.ts
            └── types/
                └── index.ts   # Shared TypeScript interfaces
```

## Distributable Build

```bash
npm run dist:mac     # macOS .dmg + .zip
npm run dist:win     # Windows NSIS installer
npm run dist:linux   # Linux AppImage
```

## License

MIT
