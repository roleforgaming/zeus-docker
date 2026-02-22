import { type Page } from "@playwright/test";

declare global {
  interface Window {
    zeus: any;
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

export const APP_URL = "http://localhost:3000";

/** Time to wait for the app shell to be ready after navigation. */
export const APP_READY_TIMEOUT = 8_000;

/** Time to wait for UI state changes (panel open/close, menu toggles). */
export const UI_TIMEOUT = 3_000;

/** Time to wait for an AI response — requires a live backend + Claude Code. */
export const AI_RESPONSE_TIMEOUT = 30_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the app and wait until the sidebar is rendered AND the
 * Socket.IO WebSocket handshake is complete.
 *
 * The sidebar renders almost immediately after App.svelte mounts, but the
 * Socket.IO connection (used by terminal creation, Claude sessions, etc.)
 * completes its HTTP→WebSocket upgrade a few hundred ms later.
 * Waiting for `networkidle` ensures no pending HTTP requests remain, which
 * means the WebSocket upgrade has finished and `invoke()` calls will succeed.
 */
export async function loadApp(page: Page) {
  await page.goto(APP_URL);
  // networkidle fires once the Socket.IO WebSocket upgrade HTTP request
  // completes — after this, `socket.emit(...)` calls reach the server reliably.
  await page.waitForLoadState("networkidle", { timeout: APP_READY_TIMEOUT });
  // Confirm the sidebar is visible (App.svelte fully mounted)
  await page.waitForSelector("aside.sidebar", {
    state: "visible",
    timeout: APP_READY_TIMEOUT,
  });

  const cwd = process.cwd();

  // Programmatically ensure a workspace is active (fixes the 'Select workspace' or wrong workspace state)
  await page.evaluate(async (path) => {
    if (window.zeus?.workspace) {
      await window.zeus.workspace.add(path);
    }
  }, cwd);

  // Wait for the UI to update and display an active workspace name
  await page.waitForSelector('.ws-trigger-name:not(.placeholder)', {
    state: "visible",
    timeout: APP_READY_TIMEOUT,
  });
}
