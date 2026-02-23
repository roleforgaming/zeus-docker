/**
 * Zeus Server — Express + Socket.IO backend.
 * Replaces the Electron main process IPC handlers with Socket.IO events.
 * Each connected client gets isolated terminal sessions and shared Claude sessions.
 */
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs";
import { spawn as spawnProc } from "node:child_process";
import { createRequire } from "node:module";

// ── Server Modules ─────────────────────────────────────────────────────────────

import { initStore, getStore, saveStore, flushStore } from "./store.js";
import { spawnTerminal } from "./terminal.js";
import {
  IDE_LIST,
  detectInstalledIDEs,
  isClaudeCodeInstalled,
  getClaudeCodeVersion,
  getClaudeModelAliases,
  checkLatestClaudeVersion,
  updateClaudeCode,
  getShellEnv,
} from "./claude-cli.js";
import {
  initClaudeSession,
  getSession,
  deleteSession,
  spawnClaudeSession,
  respondToSession,
  abortSession,
  killAllClaudeSessions,
} from "./claude-session.js";
import {
  readClaudeConfig,
  writeClaudeConfig,
  readProjectClaudeConfig,
  writeProjectClaudeConfig,
  installMCPPackage,
  checkMcpHealth,
  listPlugins,
  listMarketplaces,
  runPluginCmd,
} from "./claude-config.js";
import { scanCustomSkills } from "./skills.js";
import {
  listMarkdownFiles,
  readFileContent,
  writeFileContent,
  getGitDiff,
  getGitDiffFile,
  getGitChangedFiles,
  readClaudeTranscript,
} from "./files.js";
import {
  initSubagentWatcher,
  startSubagentWatch,
  updateSubagentTargets,
  stopSubagentWatch,
} from "./subagent-watcher.js";
import { getIDEs, openIDE } from "./ide.js";
import openLocalIDEService from "./open-local-ide.js";
import {
  getWorkspacePath,
  getProjectName,
  debugPaths,
} from "./workspace-config.js";

// ── Setup ─────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// node-pty is a native module; use createRequire in ESM context
const require = createRequire(import.meta.url);
const pty = require("node-pty");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7, // 10 MB — allow large terminal data bursts
});

// ── Static Files ──────────────────────────────────────────────────────────────

const staticDir = path.join(__dirname, "../dist/renderer");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res.send("[zeus] Frontend not built yet. Run: npm run build"),
  );
}

// Debug endpoint: show workspace path resolution
app.get("/api/debug/workspace-paths/:projectName", (req, res) => {
  try {
    const { projectName } = req.params;
    const pathInfo = debugPaths(projectName);
    res.json({
      success: true,
      data: pathInfo,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

// ── Init Global State ─────────────────────────────────────────────────────────

initStore();

// Placeholder emit — replaced per connection
let _socketEmit = (_event, _data) => {};
initClaudeSession(pty, (event, data) => _socketEmit(event, data));
initSubagentWatcher((event, data) => _socketEmit(event, data));

// ── Socket.IO Connections ─────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log("[zeus] Client connected:", socket.id);

  // Route claude-session and subagent events to this specific socket
  _socketEmit = (event, data) => socket.emit(event, data);
  initClaudeSession(pty, (event, data) => socket.emit(event, data));
  initSubagentWatcher((event, data) => socket.emit(event, data));

  // Per-socket terminal state
  const terminals = new Map();
  let nextTermId = 1;

  // ── Workspace ──────────────────────────────────────────────────────────────

  socket.on("workspace:list", (cb) => cb(getStore().workspaces));

  socket.on("workspace:add", (wsPath, cb) => {
    const store = getStore();
    if (typeof wsPath !== "string" || !wsPath) return cb(null);

    const projectName = getProjectName(wsPath);
    const dirPath = getWorkspacePath(projectName);

    try {
      // Ensure workspace directory exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Check if already in store
      if (!store.workspaces.find((w) => w.path === dirPath)) {
        // Create sentinel file for workspace integrity
        const sentinelPath = path.join(dirPath, "ZEUS_WORKSPACE.md");
        if (!fs.existsSync(sentinelPath)) {
          fs.writeFileSync(
            sentinelPath,
            "# Zeus Workspace\n\nThis directory is managed by Zeus.\n",
            "utf-8",
          );
        }

        store.workspaces.push({
          path: dirPath,
          name: projectName,
          addedAt: Date.now(),
          lastOpened: Date.now(),
        });
        saveStore();
      }
      const newWorkspace = store.workspaces.find((w) => w.path === dirPath);
      cb(newWorkspace || null);
    } catch (err) {
      console.error(`[zeus] Failed to add workspace at ${dirPath}:`, err);
      cb(null);
    }
  });

  socket.on("workspace:remove", (wsPath, cb) => {
    const store = getStore();
    store.workspaces = store.workspaces.filter((w) => w.path !== wsPath);
    if (store.lastWorkspace === wsPath) store.lastWorkspace = null;
    saveStore();
    cb(true);
  });

  socket.on("workspace:rename", (wsPath, newName, cb) => {
    const store = getStore();
    const ws = store.workspaces.find((w) => w.path === wsPath);
    if (ws) {
      ws.name = newName.trim() || path.basename(wsPath);
      saveStore();
      return cb(true);
    }
    cb(false);
  });

  socket.on("workspace:set-last", (wsPath, cb) => {
    const store = getStore();
    store.lastWorkspace = wsPath;
    const ws = store.workspaces.find((w) => w.path === wsPath);
    if (ws) ws.lastOpened = Date.now();
    saveStore();
    cb(true);
  });

  socket.on("workspace:get-last", (cb) => cb(getStore().lastWorkspace));

  socket.on("workspace:reorder", (orderedPaths, cb) => {
    const store = getStore();
    const byPath = new Map(store.workspaces.map((w) => [w.path, w]));
    const reordered = orderedPaths.map((p) => byPath.get(p)).filter(Boolean);
    for (const ws of store.workspaces) {
      if (!reordered.find((r) => r.path === ws.path)) reordered.push(ws);
    }
    store.workspaces = reordered;
    saveStore();
    cb(true);
  });

  // ── Terminal ───────────────────────────────────────────────────────────────

  socket.on("terminal:create", (workspacePath, cb) => {
    const termId = nextTermId++;
    try {
      const { ptyProcess } = spawnTerminal(pty, workspacePath);
      terminals.set(termId, ptyProcess);

      ptyProcess.onData((data) =>
        socket.emit("terminal:data", { id: termId, data }),
      );
      ptyProcess.onExit(({ exitCode }) => {
        console.log(`[zeus] terminal:exit id=${termId} exitCode=${exitCode}`);
        socket.emit("terminal:exit", { id: termId, exitCode });
        terminals.delete(termId);
      });

      cb(termId);
    } catch (e) {
      console.error(
        `[zeus] terminal:create failed for path="${workspacePath}":`,
        e.message,
      );
      cb(-1);
    }
  });

  socket.on("terminal:write", ({ id, data }) => {
    terminals.get(id)?.write(data);
  });

  socket.on("terminal:resize", ({ id, cols, rows }) => {
    try {
      terminals.get(id)?.resize(cols, rows);
    } catch (e) {
      console.warn(`[zeus] terminal:resize failed for id=${id}:`, e);
    }
  });

  socket.on("terminal:kill", (id, cb) => {
    const term = terminals.get(id);
    if (term) {
      try {
        term.kill();
      } catch {
        /* ignore */
      }
      terminals.delete(id);
    }
    cb(true);
  });

  // ── Claude CLI ─────────────────────────────────────────────────────────────

  socket.on("claude:is-installed", (cb) => cb(isClaudeCodeInstalled()));
  socket.on("claude:version", (cb) => cb(getClaudeCodeVersion()));
  socket.on("claude:models", (cb) => cb(getClaudeModelAliases()));
  socket.on("claude:check-latest", async (cb) =>
    cb(await checkLatestClaudeVersion()),
  );
  socket.on("claude:update", async (cb) => cb(await updateClaudeCode()));

  // ── IDE ────────────────────────────────────────────────────────────────────

  socket.on("ide:list", (cb) => cb(getIDEs()));

  socket.on("ide:open", ({ ideCmd, workspacePath }, cb) => {
    cb(openIDE(ideCmd, workspacePath));
  });

  socket.on("ide:get-preference", (cb) => cb(getStore().idePreference));

  socket.on("ide:set-preference", (ideId, cb) => {
    getStore().idePreference = ideId;
    saveStore();
    cb(true);
  });

  // ── Open Local IDE ─────────────────────────────────────────────────────────

  socket.on("open-local-ide", async ({ ideType, workspacePath }) => {
    try {
      console.log("[zeus:ide] open-local-ide request:", {
        ideType,
        workspacePath,
      });

      // Get the session for this socket connection
      const sessionId = socket.handshake.auth?.sessionId;
      const session = sessionId ? getSession(sessionId) : null;

      // Call the open-local-ide service
      const response = await openLocalIDEService(
        session,
        ideType,
        workspacePath,
      );

      // Always emit a response with the IDE type in the event name
      socket.emit(`open-local-ide-response-${ideType}`, response);

      console.log("[zeus:ide] open-local-ide response:", {
        ideType,
        success: response.success,
        error: response.error,
      });
    } catch (err) {
      console.error("[zeus:ide] open-local-ide error:", err);

      // Emit error response even on exception
      const ideType = arguments[0]?.ideType || "unknown";
      socket.emit(`open-local-ide-response-${ideType}`, {
        success: false,
        message: "Failed to launch IDE",
        error: err.message,
      });
    }
  });

  // ── System ─────────────────────────────────────────────────────────────────

  socket.on("system:open-external", (url, cb) => {
    const openCmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    try {
      const child = spawnProc(openCmd, [url], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {});
      child.unref();
    } catch {
      /* best-effort */
    }
    cb(true);
  });

  socket.on("system:reveal-in-finder", (p, cb) => {
    const revealCmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer"
          : "xdg-open";
    const revealArgs = process.platform === "darwin" ? ["-R", p] : [p];
    try {
      const child = spawnProc(revealCmd, revealArgs, {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {});
      child.unref();
    } catch {
      /* best-effort */
    }
    cb(true);
  });

  socket.on("system:get-home", (cb) => cb(os.homedir()));
  socket.on("system:path-exists", (p, cb) => cb(fs.existsSync(p)));

  socket.on("system:get-dir-info", (dirPath, cb) => {
    try {
      if (!fs.statSync(dirPath).isDirectory()) return cb(null);
      const hasGit = fs.existsSync(path.join(dirPath, ".git"));
      const hasPackageJson = fs.existsSync(path.join(dirPath, "package.json"));
      let packageName = null;
      if (hasPackageJson) {
        try {
          packageName = JSON.parse(
            fs.readFileSync(path.join(dirPath, "package.json"), "utf-8"),
          ).name;
        } catch {
          /* ignore */
        }
      }
      cb({
        name: path.basename(dirPath),
        path: dirPath,
        hasGit,
        hasPackageJson,
        packageName,
      });
    } catch {
      cb(null);
    }
  });

  // ── Claude Config / MCP ────────────────────────────────────────────────────

  socket.on("claude-config:read", (cb) => cb(readClaudeConfig()));
  socket.on("claude-config:write", (config, cb) =>
    cb(writeClaudeConfig(config)),
  );
  socket.on("claude-config:read-project", (wsPath, cb) =>
    cb(readProjectClaudeConfig(wsPath)),
  );
  socket.on("claude-config:write-project", (wsPath, config, cb) =>
    cb(writeProjectClaudeConfig(wsPath, config)),
  );

  socket.on("mcp:install", async (pkg, cb) => cb(await installMCPPackage(pkg)));
  socket.on("mcp:health", async (cb) => cb(await checkMcpHealth()));

  // ── Plugins ────────────────────────────────────────────────────────────────

  socket.on("plugin:list", async (cb) => cb(await listPlugins()));
  socket.on("plugin:marketplace-list", async (cb) =>
    cb(await listMarketplaces()),
  );
  socket.on("plugin:install", async (name, scope, cb) =>
    cb(await runPluginCmd("install", name, scope)),
  );
  socket.on("plugin:uninstall", async (name, cb) =>
    cb(await runPluginCmd("uninstall", name)),
  );
  socket.on("plugin:enable", async (name, scope, cb) =>
    cb(await runPluginCmd("enable", name, scope)),
  );
  socket.on("plugin:disable", async (name, scope, cb) =>
    cb(await runPluginCmd("disable", name, scope)),
  );
  socket.on("plugin:marketplace-add", async (source, cb) =>
    cb(await runPluginCmd("marketplace add", source)),
  );

  // ── Skills ─────────────────────────────────────────────────────────────────

  socket.on("skills:scan", async (wsPath, cb) =>
    cb(await scanCustomSkills(wsPath)),
  );

  // ── Files / Markdown ───────────────────────────────────────────────────────

  socket.on("files:list-md", (dirPath, cb) => cb(listMarkdownFiles(dirPath)));
  socket.on("files:read", (filePath, cb) =>
    cb(readFileContent(filePath, getStore())),
  );
  socket.on("files:write", (filePath, content, cb) =>
    cb(writeFileContent(filePath, content, getStore())),
  );

  // ── Git ────────────────────────────────────────────────────────────────────

  socket.on("git:diff", async (workspacePath, cb) =>
    cb(await getGitDiff(workspacePath)),
  );
  socket.on("git:diff-file", async (workspacePath, filePath, cb) =>
    cb(await getGitDiffFile(workspacePath, filePath)),
  );
  socket.on("git:changed-files", async (workspacePath, cb) =>
    cb(await getGitChangedFiles(workspacePath)),
  );

  // ── Saved Claude Sessions ──────────────────────────────────────────────────

  socket.on("claude-session:list-saved", (workspacePath, cb) => {
    const saved = getStore().savedSessions ?? [];
    cb(
      saved
        .filter((s) => s.workspacePath === workspacePath)
        .sort((a, b) => b.lastUsed - a.lastUsed),
    );
  });

  socket.on("claude-session:save", (session, cb) => {
    const store = getStore();
    if (!store.savedSessions) store.savedSessions = [];
    const existing = store.savedSessions.find(
      (s) => s.sessionId === session.sessionId,
    );
    if (existing) {
      existing.title = session.title;
      existing.lastUsed = Date.now();
    } else {
      store.savedSessions.push({ ...session, lastUsed: Date.now() });
    }
    const byWs = store.savedSessions.filter(
      (s) => s.workspacePath === session.workspacePath,
    );
    if (byWs.length > 50) {
      const oldest = byWs.sort((a, b) => a.lastUsed - b.lastUsed)[0];
      store.savedSessions = store.savedSessions.filter(
        (s) => s.sessionId !== oldest.sessionId,
      );
    }
    saveStore();
    cb(true);
  });

  socket.on("claude-session:delete-saved", (sessionId, cb) => {
    const store = getStore();
    if (!store.savedSessions) return cb(true);
    store.savedSessions = store.savedSessions.filter(
      (s) => s.sessionId !== sessionId,
    );
    saveStore();
    cb(true);
  });

  socket.on(
    "claude-session:read-transcript",
    (sessionId, workspacePath, cb) => {
      cb(readClaudeTranscript(sessionId, workspacePath));
    },
  );

  // ── Claude Session (PTY-based) ─────────────────────────────────────────────

  socket.on(
    "claude-session:send",
    (conversationId, prompt, cwd, model, resumeSessionId, cb) => {
      cb(
        spawnClaudeSession(conversationId, prompt, cwd, model, resumeSessionId),
      );
    },
  );

  socket.on("claude-session:abort", (conversationId, cb) =>
    cb(abortSession(conversationId)),
  );

  socket.on("claude-session:respond", (conversationId, response, cb) => {
    if (respondToSession(conversationId, response)) return cb(true);
    const session = getSession(conversationId);
    if (session?.sessionId && session.cwd) {
      console.log(
        `[zeus] PTY unavailable for [${conversationId}], re-spawning with --resume`,
      );
      return cb(
        spawnClaudeSession(
          conversationId,
          response,
          session.cwd,
          undefined,
          session.sessionId,
        ),
      );
    }
    cb(false);
  });

  socket.on("claude-session:close", (conversationId, cb) => {
    const session = getSession(conversationId);
    if (session?.pty) {
      try {
        session.pty.kill();
      } catch {
        /* ignore */
      }
    }
    deleteSession(conversationId);
    stopSubagentWatch();
    cb(true);
  });

  // ── Subagent Watcher ───────────────────────────────────────────────────────

  socket.on(
    "claude-session:watch-subagents",
    (conversationId, parentSessionId, workspacePath, targets, cb) => {
      cb(
        startSubagentWatch(
          conversationId,
          parentSessionId,
          workspacePath,
          targets,
        ),
      );
    },
  );

  socket.on("claude-session:update-subagent-targets", (targets, cb) => {
    updateSubagentTargets(targets);
    cb(true);
  });

  socket.on("claude-session:stop-subagent-watch", (cb) => {
    stopSubagentWatch();
    cb(true);
  });

  // ── Disconnect Cleanup ─────────────────────────────────────────────────────

  socket.on("disconnect", () => {
    console.log("[zeus] Client disconnected:", socket.id);
    for (const [, term] of terminals) {
      try {
        term.kill();
      } catch {
        /* ignore */
      }
    }
    terminals.clear();
    killAllClaudeSessions();
    stopSubagentWatch();
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`[zeus] Server running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  killAllClaudeSessions();
  stopSubagentWatch();
  flushStore();
  process.exit(0);
});

process.on("SIGTERM", () => {
  killAllClaudeSessions();
  stopSubagentWatch();
  flushStore();
  process.exit(0);
});
