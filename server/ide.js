/**
 * IDE management — detection of installed desktop IDEs, virtual IDE entries,
 * and workspace-aware open logic.
 */
import { spawnSync, spawn, execSync } from "node:child_process";
import { getShellEnv } from "./claude-cli.js";
import path from "node:path";
import { getProjectName } from "./workspace-config.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Candidate desktop IDEs to probe via `which` */
const DESKTOP_IDE_CANDIDATES = [
  { id: "code", name: "VS Code", cmd: "code", icon: "vscode" },
  { id: "cursor", name: "Cursor", cmd: "cursor", icon: "cursor" },
  { id: "windsurf", name: "Windsurf", cmd: "windsurf", icon: "windsurf" },
  { id: "zed", name: "Zed", cmd: "zed", icon: "zed" },
  { id: "idea", name: "IntelliJ IDEA", cmd: "idea", icon: "idea" },
  { id: "webstorm", name: "WebStorm", cmd: "webstorm", icon: "webstorm" },
  { id: "sublime", name: "Sublime Text", cmd: "subl", icon: "sublime" },
  { id: "nvim", name: "Neovim", cmd: "nvim", icon: "vim" },
  {
    id: "antigravity",
    name: "Anti-Gravity",
    cmd: "antigravity",
    icon: "antigravity",
  },
];

/** Virtual IDE entries always present regardless of local install */
const VIRTUAL_IDES = [
  {
    id: "vscode-host",
    name: "VS Code (Local Host)",
    cmd: "code",
    type: "local",
    icon: "vscode",
  },
  {
    id: "codeserver",
    name: "Code Server",
    cmd: "codeserver", // Special marker; resolved to URL at runtime
    type: "browser",
    icon: "codeserver",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return true if `cmd` is resolvable in the current PATH.
 * Uses the user's login shell first so GUI-launched processes see the full PATH.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function isCommandAvailable(cmd) {
  // Strategy 1: login shell (captures ~/.zshrc / ~/.bashrc PATH extensions)
  if (process.platform !== "win32") {
    try {
      const shell = process.env.SHELL || "/bin/bash";
      const result = execSync(`${shell} -l -c 'which ${cmd}'`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (result.length > 0) return true;
    } catch {
      /* fall through to strategy 2 */
    }
  }

  // Strategy 2: direct which / where
  try {
    const whichCmd =
      process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
    const result = execSync(whichCmd, {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve a workspace path for desktop IDE spawning.
 * In the unified container, workspace paths are consistent across all components.
 *
 * @param {string} workspacePath
 * @returns {string}
 */
function resolveWorkspacePath(workspacePath) {
  return workspacePath;
}

/**
 * Generate the code-server URL for a given workspace path.
 * code-server works with local file paths; we pass the workspace path
 * as a query parameter for the frontend to handle.
 *
 * @param {string} workspacePath
 * @returns {string}
 */
function generateCodeServerUrl(workspacePath) {
  // Port 8081 is the public-facing port from docker-compose.yml
  const baseUrl = "http://localhost:8081";
  return `${baseUrl}/?folder=${encodeURIComponent(workspacePath)}`;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Return all available IDEs: virtual entries (always present) plus any
 * desktop IDEs detected on the current machine.
 *
 * @returns {Array<{id: string, name: string, cmd: string, type?: string, icon?: string}>}
 */
export function getIDEs() {
  const detected = DESKTOP_IDE_CANDIDATES.filter((ide) =>
    isCommandAvailable(ide.cmd),
  ).map((ide) => ({ ...ide, type: "local" }));

  // Virtual entries come first; deduplicate by id in case a virtual entry
  // (e.g. vscode-host / code) also appears in the detected list.
  const detectedIds = new Set(detected.map((d) => d.id));
  const uniqueVirtual = VIRTUAL_IDES.filter((v) => !detectedIds.has(v.id));

  // In container mode, hide local IDE options (Host Agent won't be available)
  // Only show browser-based IDEs (like code-server)
  if (process.env.ZEUS_CONTAINER_MODE === "true") {
    return uniqueVirtual.filter((ide) => ide.type === "browser");
  }

  return [...uniqueVirtual, ...detected];
}

/**
 * Open a workspace in the specified IDE.
 *
 * - For 'codeserver': return a URL object with code-server access URL
 * - For http/https URLs: return the URL immediately for the caller to open
 * - Otherwise spawn the IDE binary with the resolved workspace path
 *
 * @param {string} cmd            IDE binary name, URL, or special marker ('codeserver')
 * @param {string} workspacePath  Absolute path to the workspace directory
 * @returns {{ success: boolean, url?: string, error?: string }}
 */
export function openIDE(cmd, workspacePath) {
  // code-server: generate URL pointing to code-server instance
  if (cmd === "codeserver") {
    try {
      const url = generateCodeServerUrl(workspacePath);
      return { success: true, url };
    } catch (err) {
      console.error(`[ide] Failed to generate code-server URL:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // Browser-based IDE (http/https URL): return URL for the caller to open
  if (/^https?:\/\//i.test(cmd)) {
    return { success: true, url: cmd };
  }

  // Desktop IDE: spawn binary with workspace path
  const resolvedPath = resolveWorkspacePath(workspacePath);

  try {
    const child = spawn(cmd, [resolvedPath], {
      detached: true,
      stdio: "ignore",
      shell: true,
      env: getShellEnv(),
    });
    child.on("error", (err) => {
      console.error(`[ide] Error opening IDE "${cmd}":`, err.message);
    });
    child.unref();
    return { success: true };
  } catch (err) {
    console.error(
      `[ide] Failed to open IDE "${cmd}" at "${resolvedPath}":`,
      err.message,
    );
    return { success: false, error: err.message };
  }
}
