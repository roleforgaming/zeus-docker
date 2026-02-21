import { type Page } from "@playwright/test";

// ── Constants ────────────────────────────────────────────────────────────────

export const APP_URL = "http://localhost:5173";

/** Time to wait for the app shell to be ready after navigation. */
export const APP_READY_TIMEOUT = 8_000;

/** Time to wait for UI state changes (panel open/close, menu toggles). */
export const UI_TIMEOUT = 3_000;

/** Time to wait for an AI response — requires a live backend + Claude Code. */
export const AI_RESPONSE_TIMEOUT = 30_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the app and wait until the sidebar is rendered.
 * The sidebar is the primary indicator that the app shell has mounted.
 */
export async function loadApp(page: Page) {
  await page.goto(APP_URL);
  // aside.sidebar is always in the DOM once App.svelte mounts
  await page.waitForSelector("aside.sidebar", {
    state: "visible",
    timeout: APP_READY_TIMEOUT,
  });
}
