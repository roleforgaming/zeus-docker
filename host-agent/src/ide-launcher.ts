/**
 * IDE Launcher — OS-aware IDE command resolution and spawning.
 *
 * Handles:
 * - IDE command resolution for Windows (.cmd files), macOS, and Linux
 * - workspace path resolution with explicit override support
 * - IDE process spawning with detached mode and proper environment
 */

import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

// ── Types ──────────────────────────────────────────────────────────────────

export interface IDELaunchRequest {
  ideType: string;
  workspacePath: string;
}

export interface IDELaunchResult {
  success: boolean;
  error?: string;
}

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * IDE command mappings. Maps IDE type to the command that should be executed.
 * Windows variants use .cmd wrapper.
 */
const IDE_COMMANDS: Record<string, { unix: string; windows: string }> = {
  code: { unix: "code", windows: "code.cmd" },
  cursor: { unix: "cursor", windows: "cursor.cmd" },
  windsurf: { unix: "windsurf", windows: "windsurf.cmd" },
  zed: { unix: "zed", windows: "zed.cmd" },
  idea: { unix: "idea", windows: "idea.cmd" },
  webstorm: { unix: "webstorm", windows: "webstorm.cmd" },
  sublime: { unix: "subl", windows: "subl.cmd" },
  nvim: { unix: "nvim", windows: "nvim.cmd" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the appropriate IDE command for the current platform.
 * On Windows, checks for .cmd wrapper files in PATH.
 * On Unix systems, uses the command directly.
 *
 * @param ideType - The IDE type (e.g. "code", "cursor")
 * @returns The resolved command to execute, or null if not found/invalid
 */
export function resolveIDECommand(ideType: string): string | null {
  const commands = IDE_COMMANDS[ideType.toLowerCase()];
  if (!commands) {
    return null;
  }

  const isWindows = process.platform === "win32";
  const cmdToUse = isWindows ? commands.windows : commands.unix;

  // On Windows, verify the .cmd file exists in PATH before returning
  if (isWindows) {
    try {
      const result = spawnSync("where", [cmdToUse], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      });

      if (result.status === 0 && result.stdout.trim()) {
        return cmdToUse;
      }
    } catch {
      // Fall through to return null
    }
    return null;
  }

  // On Unix, verify command is in PATH using 'which'
  try {
    const result = spawnSync("which", [cmdToUse], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });

    if (result.status === 0 && result.stdout.trim()) {
      return cmdToUse;
    }
  } catch {
    // Fall through to return null
  }

  return null;
}

/**
 * Validate and resolve a workspace path.
 * Supports explicit path override via ZEUS_HOST_PROJECT_ROOT environment variable.
 *
 * @param workspacePath - The workspace path to validate
 * @param projectRoot - Optional explicit project root (from environment)
 * @returns The resolved absolute path, or null if invalid
 */
export function resolveWorkspacePath(
  workspacePath: string,
  projectRoot?: string,
): string | null {
  if (!workspacePath) return null;

  let candidate: string;

  if (projectRoot) {
    candidate = path.join(projectRoot, workspacePath);
  } else {
    candidate = workspacePath;
  }

  if (!path.isAbsolute(candidate) || !fs.existsSync(candidate)) {
    return null;
  }

  // Canonicalize and enforce that it stays under projectRoot if provided
  const real = fs.realpathSync(candidate);

  if (projectRoot) {
    const realRoot = fs.realpathSync(projectRoot);
    if (!real.startsWith(realRoot + path.sep)) {
      return null;
    }
  }

  return real;
}


/**
 * Spawn an IDE process for the given workspace path.
 * Detaches the process so it continues running after this process exits.
 *
 * @param ideCommand - The IDE command to execute (resolved via resolveIDECommand)
 * @param workspacePath - The absolute path to the workspace
 * @returns Success/error result
 */
export function spawnIDEProcess(
  ideCommand: string,
  workspacePath: string,
): IDELaunchResult {
  try {
    // Re-resolve and re-validate just before spawning
    const projectRoot = process.env.ZEUS_HOST_PROJECT_ROOT;
    const finalPath = resolveWorkspacePath(workspacePath, projectRoot);
    if (!finalPath) {
      return {
        success: false,
        error: "Workspace path became invalid before launch",
      };
    }

    const child = spawn(ideCommand, [finalPath], {
      detached: true,
      stdio: "ignore",
      shell: false,
      env: process.env,
    });

    child.unref();
    return { success: true };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    return {
      success: false,
      error: `Failed to spawn IDE: ${errorMessage}`,
    };
  }
}


// ── Main Launch Function ───────────────────────────────────────────────────

/**
 * Launch an IDE for the given request.
 * Validates IDE type, resolves workspace path, and spawns the process.
 *
 * @param request - The launch request containing ideType and workspacePath
 * @returns Success/error result
 */
export function launchIDE(request: IDELaunchRequest): IDELaunchResult {
  // Validate IDE type
  if (!request.ideType) {
    return {
      success: false,
      error: "Invalid IDE type: must be non-empty string",
    };
  }

  // Resolve IDE command for the current platform
  const ideCommand = resolveIDECommand(request.ideType);
  if (!ideCommand) {
    return {
      success: false,
      error: `IDE '${request.ideType}' not found in PATH for this platform`,
    };
  }

  // Resolve workspace path
  const projectRoot = process.env.ZEUS_HOST_PROJECT_ROOT;
  const resolvedPath = resolveWorkspacePath(request.workspacePath, projectRoot);

  if (!resolvedPath) {
    return {
      success: false,
      error: `Workspace path '${request.workspacePath}' does not exist or is invalid`,
    };
  }

  // Log the launch details before spawning
  console.log("[host-agent:ide-launcher] Launching IDE:", {
    ideType: request.ideType,
    ideCommand,
    resolvedPath,
  });

  // Spawn the IDE process
  return spawnIDEProcess(ideCommand, resolvedPath);
}
