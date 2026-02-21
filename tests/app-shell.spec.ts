import { test, expect } from "@playwright/test";
import { loadApp, UI_TIMEOUT } from "./helpers/app";

// ── App Shell ─────────────────────────────────────────────────────────────────

test.describe("Zeus IDE – App Shell", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("renders the sidebar with Zeus logo", async ({ page }) => {
    // Sidebar header contains the branding
    const logo = page.locator(".sidebar-header .sidebar-logo");
    await expect(logo).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(logo).toContainText("Zeus");
  });

  test("renders toolbar with sidebar-toggle and panel-toggle buttons", async ({
    page,
  }) => {
    const toolbar = page.locator(".toolbar");
    await expect(toolbar).toBeVisible({ timeout: UI_TIMEOUT });

    // Sidebar toggle button — title comes from the source: "Toggle sidebar (Cmd+B)"
    await expect(toolbar.getByTitle("Toggle sidebar (Cmd+B)")).toBeVisible();

    // Right panel toggle button — title: "Toggle panel (Cmd+I)"
    await expect(toolbar.getByTitle("Toggle panel (Cmd+I)")).toBeVisible();
  });

  test("renders status bar", async ({ page }) => {
    await expect(page.locator(".statusbar")).toBeVisible({
      timeout: UI_TIMEOUT,
    });
  });
});

// ── Right Panel ───────────────────────────────────────────────────────────────

test.describe("Zeus IDE – Right Panel", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("can toggle the right panel open and closed", async ({ page }) => {
    const toggleBtn = page
      .locator(".toolbar")
      .getByTitle("Toggle panel (Cmd+I)");
    const rightPanel = page.locator("aside.right-panel");

    // Panel starts collapsed by default on fresh load
    await toggleBtn.click();
    await expect(rightPanel).not.toHaveClass(/collapsed/, {
      timeout: UI_TIMEOUT,
    });

    // Toggle closed again
    await toggleBtn.click();
    await expect(rightPanel).toHaveClass(/collapsed/, { timeout: UI_TIMEOUT });
  });

  test("right panel shows tabs: Skills, MCP, Docs", async ({ page }) => {
    const toggleBtn = page
      .locator(".toolbar")
      .getByTitle("Toggle panel (Cmd+I)");
    await toggleBtn.click();

    const rightPanel = page.locator("aside.right-panel");
    await expect(rightPanel).not.toHaveClass(/collapsed/, {
      timeout: UI_TIMEOUT,
    });

    const tabStrip = rightPanel.locator(".tab-strip");
    await expect(tabStrip).toBeVisible({ timeout: UI_TIMEOUT });

    await expect(tabStrip.getByTitle("Skills")).toBeVisible();
    await expect(tabStrip.getByTitle("MCP Servers")).toBeVisible();
    await expect(tabStrip.getByTitle("Docs")).toBeVisible();
  });

  test("can switch between Skills, MCP, and Docs tabs", async ({ page }) => {
    await page.locator(".toolbar").getByTitle("Toggle panel (Cmd+I)").click();
    const rightPanel = page.locator("aside.right-panel");
    await expect(rightPanel).not.toHaveClass(/collapsed/, {
      timeout: UI_TIMEOUT,
    });

    const tabStrip = rightPanel.locator(".tab-strip");

    // Switch to MCP tab
    await tabStrip.getByTitle("MCP Servers").click();
    await expect(tabStrip.getByTitle("MCP Servers")).toHaveClass(/active/, {
      timeout: UI_TIMEOUT,
    });

    // Switch to Docs tab
    await tabStrip.getByTitle("Docs").click();
    await expect(tabStrip.getByTitle("Docs")).toHaveClass(/active/, {
      timeout: UI_TIMEOUT,
    });

    // Switch back to Skills tab
    await tabStrip.getByTitle("Skills").click();
    await expect(tabStrip.getByTitle("Skills")).toHaveClass(/active/, {
      timeout: UI_TIMEOUT,
    });
  });

  test("right panel content area is not empty when open", async ({ page }) => {
    await page.locator(".toolbar").getByTitle("Toggle panel (Cmd+I)").click();
    const rightPanel = page.locator("aside.right-panel");
    await expect(rightPanel).not.toHaveClass(/collapsed/, {
      timeout: UI_TIMEOUT,
    });

    const panelBody = rightPanel.locator(".panel-body");
    await expect(panelBody).toBeVisible({ timeout: UI_TIMEOUT });
  });
});
