/**
 * Zeus Web API — Socket.IO client that replaces the Electron preload IPC bridge.
 * Exposes the same window.zeus API shape so Svelte components need zero changes.
 */
import { io, Socket } from "socket.io-client";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";

// ── Socket ────────────────────────────────────────────────────────────────────

const socket: Socket = io(window.location.origin, {
  transports: ["websocket", "polling"],
});

// ── Local xterm instances ─────────────────────────────────────────────────────

interface LocalTerminal {
  xterm: Terminal;
  fitAddon: FitAddon;
  addons: { dispose(): void }[];
}
const localTerminals = new Map<number, LocalTerminal>();

// ── Terminal Theme — Catppuccin Mocha ─────────────────────────────────────────

const THEME = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  cursorAccent: "#1e1e2e",
  selectionBackground: "rgba(203, 166, 247, 0.28)",
  selectionForeground: "#cdd6f4",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#cba6f7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#cba6f7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
} as const;

// ── Helper: emit with ack (promise-based) ─────────────────────────────────────

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(channel, ...args, (result: T) => resolve(result));
  });
}

// ── Build window.zeus ─────────────────────────────────────────────────────────

const zeus = {
  // ── Workspace ──
  workspace: {
    list: () => invoke("workspace:list"),
    add: (wsPath?: string) => invoke("workspace:add", wsPath),
    remove: (wsPath: string) => invoke("workspace:remove", wsPath),
    rename: (wsPath: string, newName: string) =>
      invoke("workspace:rename", wsPath, newName),
    setLast: (wsPath: string) => invoke("workspace:set-last", wsPath),
    getLast: () => invoke("workspace:get-last"),
    reorder: (orderedPaths: string[]) =>
      invoke("workspace:reorder", orderedPaths),
  },

  // ── Terminal ──
  terminal: {
    create: (workspacePath?: string) =>
      invoke<number>("terminal:create", workspacePath),

    attach: (termId: number, elementId: string) => {
      const container = document.getElementById(elementId);
      if (!container) throw new Error(`Element #${elementId} not found`);

      const xterm = new Terminal({
        fontSize: 14,
        fontFamily:
          "'D2Coding ligature', D2Coding, 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
        lineHeight: 1.35,
        theme: THEME,
        cursorBlink: true,
        cursorStyle: "bar",
        cursorInactiveStyle: "outline",
        allowTransparency: true,
        scrollback: 5000,
        tabStopWidth: 4,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 1,
      });

      const addons: { dispose(): void }[] = [];
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      addons.push(fitAddon);

      try {
        const wl = new WebLinksAddon((_: MouseEvent, uri: string) => {
          window.open(uri, "_blank");
        });
        xterm.loadAddon(wl);
        addons.push(wl);
      } catch { 
        /* empty: WebLinksAddon is optional */
      }

      xterm.open(container);

      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        xterm.loadAddon(webgl);
        addons.push(webgl);
      } catch { 
          /* empty: WebglAddon is optional */
      }

      if (container.offsetWidth > 0 || container.offsetHeight > 0) {
        fitAddon.fit();
      }

      // Ctrl+C: copy selected text; if nothing selected, pass through as PTY interrupt (\x03)
      // Ctrl+V: paste clipboard text into the PTY
      xterm.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
        if (ev.type !== "keydown") return true;
        if (ev.ctrlKey && ev.key === "c") {
          const selection = xterm.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(() => { });
            return false; // suppress — don't send \x03
          }
          return true; // no selection: let xterm send \x03 (interrupt)
        }
        if (ev.ctrlKey && ev.key === "v") {
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text)
                socket.emit("terminal:write", { id: termId, data: text });
            })
            .catch(() => { });
          return false; // suppress browser default paste
        }
        return true;
      });

      xterm.onData((data) =>
        socket.emit("terminal:write", { id: termId, data }),
      );
      xterm.onResize(({ cols, rows }) =>
        socket.emit("terminal:resize", { id: termId, cols, rows }),
      );

      localTerminals.set(termId, { xterm, fitAddon, addons });
      socket.emit("terminal:resize", {
        id: termId,
        cols: xterm.cols,
        rows: xterm.rows,
      });

      return { cols: xterm.cols, rows: xterm.rows };
    },

    writeToPty: (termId: number, data: string) =>
      socket.emit("terminal:write", { id: termId, data }),
    focus: (termId: number) => localTerminals.get(termId)?.xterm.focus(),

    fit: (termId: number) => {
      const t = localTerminals.get(termId);
      if (!t) return null;
      t.fitAddon.fit();
      return { cols: t.xterm.cols, rows: t.xterm.rows };
    },

    clear: (termId: number) => localTerminals.get(termId)?.xterm.clear(),

    getSize: (termId: number) => {
      const t = localTerminals.get(termId);
      return t ? { cols: t.xterm.cols, rows: t.xterm.rows } : null;
    },

    kill: async (termId: number) => {
      const local = localTerminals.get(termId);
      if (local) {
        for (const addon of local.addons) {
          try {
            addon.dispose();
          } catch { 
            /* empty: dispose is optional */
          }
        }
        local.addons.length = 0;
        try {
          local.xterm.dispose();
        } catch { 
          /* empty: dispose is optional */
        }
        localTerminals.delete(termId);
      }
      return invoke("terminal:kill", termId);
    },

    onData: (callback: (payload: { id: number; data: string }) => void) => {
      const handler = (payload: { id: number; data: string }) => {
        const local = localTerminals.get(payload.id);
        if (!local) return;
        local.xterm.write(payload.data);
        callback(payload);
      };
      socket.on("terminal:data", handler);
      return () => socket.off("terminal:data", handler);
    },

    onExit: (callback: (payload: { id: number; exitCode: number }) => void) => {
      const handler = (payload: { id: number; exitCode: number }) => {
        const local = localTerminals.get(payload.id);
        if (local) {
          local.xterm.writeln(
            `\r\n\x1B[90m[Process exited with code ${payload.exitCode}]\x1B[0m`,
          );
        }
        callback(payload);
      };
      socket.on("terminal:exit", handler);
      return () => socket.off("terminal:exit", handler);
    },
  },

  // ── Claude Code ──
  claude: {
    isInstalled: () => invoke("claude:is-installed"),
    version: () => invoke("claude:version"),
    models: () => invoke("claude:models"),
    checkLatest: () => invoke("claude:check-latest"),
    update: () => invoke("claude:update"),
  },

  // ── Claude Session ──
  claudeSession: {
    send: (
      conversationId: string,
      prompt: string,
      cwd: string,
      model?: string,
      resumeSessionId?: string,
    ) =>
      invoke(
        "claude-session:send",
        conversationId,
        prompt,
        cwd,
        model,
        resumeSessionId,
      ),
    abort: (conversationId: string) =>
      invoke("claude-session:abort", conversationId),
    respond: (conversationId: string, response: string) =>
      invoke("claude-session:respond", conversationId, response),
    close: (conversationId: string) =>
      invoke("claude-session:close", conversationId),
    listSaved: (workspacePath: string) =>
      invoke("claude-session:list-saved", workspacePath),
    save: (session: {
      sessionId: string;
      title: string;
      workspacePath: string;
    }) => invoke("claude-session:save", session),
    readTranscript: (sessionId: string, workspacePath: string) =>
      invoke("claude-session:read-transcript", sessionId, workspacePath),
    deleteSaved: (sessionId: string) =>
      invoke("claude-session:delete-saved", sessionId),

    onEvent: (
      callback: (payload: {
        id: string;
        event: Record<string, unknown>;
      }) => void,
    ) => {
      socket.on("claude-session:event", callback);
      return () => socket.off("claude-session:event", callback);
    },
    onDone: (
      callback: (payload: {
        id: string;
        exitCode: number;
        sessionId?: string;
      }) => void,
    ) => {
      socket.on("claude-session:done", callback);
      return () => socket.off("claude-session:done", callback);
    },
    watchSubagents: (
      conversationId: string,
      parentSessionId: string,
      workspacePath: string,
      targets: { taskId?: string; name: string; description: string }[],
    ) =>
      invoke(
        "claude-session:watch-subagents",
        conversationId,
        parentSessionId,
        workspacePath,
        targets,
      ),
    updateSubagentTargets: (
      targets: { taskId?: string; name: string; description: string }[],
    ) => invoke("claude-session:update-subagent-targets", targets),
    stopSubagentWatch: () => invoke("claude-session:stop-subagent-watch"),
    onSubagentActivity: (
      callback: (payload: {
        conversationId: string;
        activities: {
          matchedName?: string;
          matchedTaskId?: string;
          childSessionId: string;
          latestTool?: string;
          latestStatus: string;
        }[];
      }) => void,
    ) => {
      socket.on("claude-session:subagent-activity", callback);
      return () => socket.off("claude-session:subagent-activity", callback);
    },
  },

  // ── IDE ──
  ide: {
    list: () => invoke("ide:list"),
    open: (ideCmd: string, workspacePath: string) =>
      invoke("ide:open", { ideCmd, workspacePath }),
    getPreference: () => invoke("ide:get-preference"),
    setPreference: (ideId: string) => invoke("ide:set-preference", ideId),
  },

  // ── System ──
  system: {
    openExternal: (url: string) => Promise.resolve(window.open(url, "_blank") ? true : false),
    revealInFinder: (p: string) => invoke("system:reveal-in-finder", p),
    getHome: () => invoke<string>("system:get-home"),
    pathExists: (p: string) => invoke<boolean>("system:path-exists", p),
    getDirInfo: (dirPath: string) => invoke("system:get-dir-info", dirPath),
  },

  // ── Claude Config / Skills / MCP ──
  claudeConfig: {
    read: () => invoke("claude-config:read"),
    write: (config: object) => invoke("claude-config:write", config),
    readProject: (wsPath: string) =>
      invoke("claude-config:read-project", wsPath),
    writeProject: (wsPath: string, config: object) =>
      invoke("claude-config:write-project", wsPath, config),
  },

  skills: {
    scan: (wsPath: string) => invoke("skills:scan", wsPath),
  },

  mcp: {
    install: (pkg: string) => invoke("mcp:install", pkg),
    health: () => invoke("mcp:health"),
  },

  // ── Plugins ──
  plugin: {
    list: () => invoke("plugin:list"),
    marketplaceList: () => invoke("plugin:marketplace-list"),
    install: (name: string, scope?: string) =>
      invoke("plugin:install", name, scope),
    uninstall: (name: string) => invoke("plugin:uninstall", name),
    enable: (name: string, scope?: string) =>
      invoke("plugin:enable", name, scope),
    disable: (name: string, scope?: string) =>
      invoke("plugin:disable", name, scope),
    marketplaceAdd: (source: string) =>
      invoke("plugin:marketplace-add", source),
  },

  // ── Files ──
  files: {
    listMd: (dirPath: string) => invoke("files:list-md", dirPath),
    read: (filePath: string) => invoke("files:read", filePath),
    write: (filePath: string, content: string) =>
      invoke("files:write", filePath, content),
  },

  // ── Git ──
  git: {
    diff: (workspacePath: string) => invoke("git:diff", workspacePath),
    diffFile: (workspacePath: string, filePath: string) =>
      invoke("git:diff-file", workspacePath, filePath),
    changedFiles: (workspacePath: string) =>
      invoke("git:changed-files", workspacePath),
  },

  // ── Menu Actions (no-op in web — keyboard shortcuts handle these) ──
  onAction: (action: string, callback: () => void) => {
    socket.on(`action:${action}`, callback);
    return () => socket.off(`action:${action}`, callback);
  },
};

// Expose as window.zeus
(window as unknown as Record<string, unknown>).zeus = zeus;

export default zeus;
export type ZeusAPI = typeof zeus;
