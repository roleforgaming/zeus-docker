import { test, expect } from "@playwright/test";
import { loadApp, UI_TIMEOUT } from "./helpers/app";

// ── Sidebar ──────────────────────────────────────────────────────────────────

test.describe("Zeus IDE – Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("can collapse and re-expand the sidebar", async ({ page }) => {
    const sidebar = page.locator("aside.sidebar");
    const toggleBtn = page
      .locator(".toolbar")
      .getByTitle("Toggle sidebar (Cmd+B)");

    await expect(sidebar).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(sidebar).not.toHaveClass(/collapsed/);

    // Collapse
    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/collapsed/, { timeout: UI_TIMEOUT });

    // Expand again
    await toggleBtn.click();
    await expect(sidebar).not.toHaveClass(/collapsed/, { timeout: UI_TIMEOUT });
  });

  test("shows empty sessions state when no sessions are open", async ({
    page,
  }) => {
    // The empty state text is shown when all session lists are empty
    // This relies on the app loading without auto-launching a session.
    // If auto-launch is enabled (Claude installed + workspace set), this may be skipped.
    const emptyState = page.locator(".sessions-empty");
    const sessionItems = page.locator(".session-item");

    const hasEmpty = await emptyState.isVisible();
    const hasItems = (await sessionItems.count()) > 0;

    // One of these must be true — the sidebar must show either sessions or the empty state
    expect(hasEmpty || hasItems).toBe(true);
  });

  test("New Claude Code button is present in sessions header", async ({
    page,
  }) => {
    // Button title from Sidebar.svelte: "New Claude Code"
    const newClaudeBtn = page
      .locator(".sessions-header")
      .getByTitle("New Claude Code");
    await expect(newClaudeBtn).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("New Terminal button is present in sessions header", async ({
    page,
  }) => {
    // Button title from Sidebar.svelte: "New Terminal"
    const newTerminalBtn = page
      .locator(".sessions-header")
      .getByTitle("New Terminal");
    await expect(newTerminalBtn).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("can open settings modal via gear icon in sidebar footer", async ({
    page,
  }) => {
    // The settings gear icon in the sidebar footer uses title="Settings"
    const settingsBtn = page.locator(".sidebar-footer").getByTitle("Settings");
    await expect(settingsBtn).toBeVisible({ timeout: UI_TIMEOUT });

    await settingsBtn.click();

    // Settings panel is rendered inside .settings-overlay when uiStore.settingsOpen = true
    const settingsPanel = page.locator(".settings-overlay .settings-panel");
    await expect(settingsPanel).toBeVisible({ timeout: UI_TIMEOUT });

    // The panel should have a "Settings" heading
    await expect(settingsPanel.locator("h2")).toContainText("Settings");
  });

  test("can close settings modal via close button", async ({ page }) => {
    const settingsBtn = page.locator(".sidebar-footer").getByTitle("Settings");
    await settingsBtn.click();

    const settingsPanel = page.locator(".settings-overlay .settings-panel");
    await expect(settingsPanel).toBeVisible({ timeout: UI_TIMEOUT });

    // Close button is &times; inside .settings-header
    await settingsPanel.locator(".close-btn").click();
    await expect(settingsPanel).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("can close settings modal by clicking the overlay backdrop", async ({
    page,
  }) => {
    const settingsBtn = page.locator(".sidebar-footer").getByTitle("Settings");
    await settingsBtn.click();

    const overlay = page.locator(".settings-overlay");
    await expect(overlay).toBeVisible({ timeout: UI_TIMEOUT });

    // Click outside the panel (on the overlay itself)
    await overlay.click({ position: { x: 10, y: 10 } });
    await expect(overlay).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("settings panel displays theme options", async ({ page }) => {
    await page.locator(".sidebar-footer").getByTitle("Settings").click();
    const settingsPanel = page.locator(".settings-overlay .settings-panel");
    await expect(settingsPanel).toBeVisible({ timeout: UI_TIMEOUT });

    // Theme section should be present with theme cards
    await expect(
      settingsPanel.locator(".settings-section h3").first(),
    ).toContainText("Theme");
    const themeCards = settingsPanel.locator(".theme-card");
    await expect(themeCards.first()).toBeVisible();
    expect(await themeCards.count()).toBeGreaterThan(0);
  });

  test("can select a theme in settings", async ({ page }) => {
    await page.locator(".sidebar-footer").getByTitle("Settings").click();
    const settingsPanel = page.locator(".settings-overlay .settings-panel");
    await expect(settingsPanel).toBeVisible({ timeout: UI_TIMEOUT });

    const themeCards = settingsPanel.locator(".theme-card");
    const count = await themeCards.count();
    expect(count).toBeGreaterThan(1);

    // Click the second theme card (to change from whatever is currently active)
    await themeCards.nth(1).click();
    await expect(themeCards.nth(1)).toHaveClass(/active/, {
      timeout: UI_TIMEOUT,
    });
  });
});

// ── Workspace Dropdown ────────────────────────────────────────────────────────

test.describe("Zeus IDE – Workspace Dropdown", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("workspace trigger button is visible in the sidebar", async ({
    page,
  }) => {
    const wsTrigger = page.locator(".ws-dropdown .ws-trigger");
    await expect(wsTrigger).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("clicking workspace trigger opens the dropdown menu", async ({
    page,
  }) => {
    const wsTrigger = page.locator(".ws-dropdown .ws-trigger");
    await wsTrigger.click();

    const wsMenu = page.locator(".ws-dropdown .ws-menu");
    await expect(wsMenu).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test('workspace menu contains an "Add Workspace" option', async ({
    page,
  }) => {
    await page.locator(".ws-dropdown .ws-trigger").click();

    const addItem = page.locator(".ws-menu-item.add-item");
    await expect(addItem).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(addItem).toContainText("Add Workspace");
  });

  test("clicking outside the workspace dropdown closes it", async ({
    page,
  }) => {
    await page.locator(".ws-dropdown .ws-trigger").click();

    const wsMenu = page.locator(".ws-dropdown .ws-menu");
    await expect(wsMenu).toBeVisible({ timeout: UI_TIMEOUT });

    // Click somewhere outside the dropdown
    await page.locator(".sidebar-header").click();
    await expect(wsMenu).not.toBeVisible({ timeout: UI_TIMEOUT });
  });
});
