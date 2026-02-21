import { test, expect } from "@playwright/test";
import { loadApp, APP_READY_TIMEOUT, UI_TIMEOUT } from "./helpers/app";

// ── Terminal ──────────────────────────────────────────────────────────────────

test.describe("Zeus IDE – Terminal", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("can open a terminal session via the sidebar New Terminal button", async ({
    page,
  }) => {
    const newTerminalBtn = page
      .locator(".sessions-header")
      .getByTitle("New Terminal");
    await newTerminalBtn.click();

    // A terminal session item should appear in the sidebar sessions list
    // pty spawn can take longer than a plain UI toggle, so use APP_READY_TIMEOUT
    const terminalSession = page
      .locator(".session-item .session-icon.terminal")
      .first();
    await expect(terminalSession).toBeVisible({ timeout: APP_READY_TIMEOUT });

    // The terminal area should become the active view
    const terminalArea = page.locator(".terminal-area:not(.hidden)");
    await expect(terminalArea).toBeVisible({ timeout: APP_READY_TIMEOUT });
  });

  test("terminal session appears in sidebar session list with terminal icon", async ({
    page,
  }) => {
    await page.locator(".sessions-header").getByTitle("New Terminal").click();

    const terminalItem = page
      .locator(".session-item")
      .filter({
        has: page.locator(".session-icon.terminal"),
      })
      .first();
    await expect(terminalItem).toBeVisible({ timeout: APP_READY_TIMEOUT });
  });

  test("terminal session can be closed via the × close button", async ({
    page,
  }) => {
    await page.locator(".sessions-header").getByTitle("New Terminal").click();

    const terminalItem = page
      .locator(".session-item")
      .filter({
        has: page.locator(".session-icon.terminal"),
      })
      .first();
    await expect(terminalItem).toBeVisible({ timeout: APP_READY_TIMEOUT });

    // Hover to reveal the close button, then click
    await terminalItem.hover();
    await terminalItem.locator(".session-close").click();

    // Session item should be removed
    await expect(terminalItem).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("can switch between terminal and claude sessions via sidebar", async ({
    page,
  }) => {
    // Create a terminal session
    await page.locator(".sessions-header").getByTitle("New Terminal").click();
    const terminalArea = page.locator(".terminal-area:not(.hidden)");
    await expect(terminalArea).toBeVisible({ timeout: APP_READY_TIMEOUT });

    // Create a Claude session
    await page
      .locator(".sessions-header")
      .getByTitle("New Claude Code")
      .click();
    const conversationView = page.locator(".conversation-view:not(.hidden)");
    await expect(conversationView).toBeVisible({ timeout: APP_READY_TIMEOUT });

    // Switch back to the terminal session
    const terminalItem = page
      .locator(".session-item")
      .filter({
        has: page.locator(".session-icon.terminal"),
      })
      .first();
    await terminalItem.click();
    await expect(terminalArea).toBeVisible({ timeout: UI_TIMEOUT });
  });
});
