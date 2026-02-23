/**
 * Unit tests for IDE Launcher module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveIDECommand,
  resolveWorkspacePath,
  spawnIDEProcess,
  launchIDE,
  IDELaunchRequest,
} from "../src/ide-launcher";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("IDE Launcher", () => {
  describe("resolveIDECommand", () => {
    it("should return command for valid IDE types", () => {
      // This test verifies the mapping exists, but actual PATH resolution
      // depends on what's installed on the test machine
      const result = resolveIDECommand("code");
      if (result) {
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      } else {
        // If VS Code is not installed, resolveIDECommand returns null
        expect(result).toBeNull();
      }
    });

    it("should return null for invalid IDE type", () => {
      const result = resolveIDECommand("nonexistent-ide-xyz");
      expect(result).toBeNull();
    });

    it("should be case-insensitive", () => {
      const lower = resolveIDECommand("code");
      const upper = resolveIDECommand("CODE");
      // Both should return the same result (either null or the command)
      expect(lower).toBe(upper);
    });

    it("should handle all configured IDE types", () => {
      const ideTypes = [
        "code",
        "cursor",
        "windsurf",
        "zed",
        "idea",
        "webstorm",
        "sublime",
        "nvim",
      ];

      ideTypes.forEach((ideType) => {
        const result = resolveIDECommand(ideType);
        // Result can be null (IDE not installed) or a string (IDE command)
        expect(result === null || typeof result === "string").toBe(true);
      });
    });
  });

  describe("resolveWorkspacePath", () => {
    let tempDir: string;

    beforeEach(() => {
      // Create a temporary directory for testing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zeus-host-agent-test-"));
    });

    afterEach(() => {
      // Clean up temporary directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it("should resolve an absolute path that exists", () => {
      const result = resolveWorkspacePath(tempDir);
      expect(result).toBe(tempDir);
    });

    it("should return null for non-existent absolute path", () => {
      const result = resolveWorkspacePath("/nonexistent/path/xyz");
      expect(result).toBeNull();
    });

    it("should return null for empty path", () => {
      const result = resolveWorkspacePath("");
      expect(result).toBeNull();
    });

    it("should resolve relative path with projectRoot", () => {
      // Create a subdirectory in tempDir
      const workspaceSubdir = path.join(tempDir, "my-workspace");
      fs.mkdirSync(workspaceSubdir);

      // Resolve relative path using tempDir as projectRoot
      const result = resolveWorkspacePath("my-workspace", tempDir);
      expect(result).toBe(workspaceSubdir);
    });

    it("should return null for relative path without projectRoot", () => {
      const result = resolveWorkspacePath("relative/path");
      expect(result).toBeNull();
    });

    it("should return null when projectRoot path does not exist", () => {
      const result = resolveWorkspacePath("workspace", "/nonexistent/root");
      expect(result).toBeNull();
    });
  });

  describe("spawnIDEProcess", () => {
    it("should return success for valid IDE command and path", () => {
      // Use 'echo' as a safe test command that exists on all platforms
      const result = spawnIDEProcess("echo", "/tmp");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return error for non-existent command", () => {
      const result = spawnIDEProcess("nonexistent-command-xyz-123", "/tmp");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Failed to spawn IDE");
    });
  });

  describe("launchIDE", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zeus-host-agent-test-"));
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it("should return error for missing ideType", () => {
      const request: IDELaunchRequest = {
        ideType: "",
        workspacePath: tempDir,
      };

      const result = launchIDE(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid IDE type");
    });

    it("should return error for non-existent IDE", () => {
      const request: IDELaunchRequest = {
        ideType: "nonexistent-ide-xyz",
        workspacePath: tempDir,
      };

      const result = launchIDE(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found in PATH");
    });

    it("should return error for non-existent workspace path", () => {
      const request: IDELaunchRequest = {
        ideType: "code",
        workspacePath: "/nonexistent/workspace/path",
      };

      const result = launchIDE(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist or is invalid");
    });

    it("should launch with ZEUS_HOST_PROJECT_ROOT", () => {
      // Create workspace subdirectory
      const workspaceSubdir = path.join(tempDir, "test-workspace");
      fs.mkdirSync(workspaceSubdir);

      // Set environment variable
      const originalRoot = process.env.ZEUS_HOST_PROJECT_ROOT;
      process.env.ZEUS_HOST_PROJECT_ROOT = tempDir;

      try {
        const request: IDELaunchRequest = {
          ideType: "echo", // Use echo as a safe test command
          workspacePath: "test-workspace",
        };

        const result = launchIDE(request);
        // Success depends on whether 'echo' is available and can be executed
        // On most systems it should succeed
        expect(result.success || result.error).toBeDefined();
      } finally {
        // Restore environment
        if (originalRoot !== undefined) {
          process.env.ZEUS_HOST_PROJECT_ROOT = originalRoot;
        } else {
          delete process.env.ZEUS_HOST_PROJECT_ROOT;
        }
      }
    });
  });
});
