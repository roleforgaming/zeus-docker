import { test, expect } from "@playwright/test";
import { loadApp, UI_TIMEOUT } from "./helpers/app";

test.describe("Zeus IDE – IDE actions", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("can open the IDE dropdown and see options", async ({ page }) => {
    const trigger = page.locator(".ide-trigger");
    await expect(trigger).toBeVisible({ timeout: UI_TIMEOUT });

    await trigger.click();

    const menu = page.locator(".ide-menu");
    await expect(menu).toBeVisible({ timeout: UI_TIMEOUT });

    const options = menu.locator(".ide-option");
    expect(await options.count()).toBeGreaterThan(0);

    // Verify common options exist
    const text = await menu.innerText();
    expect(text).toContain("VS Code (Local Host)");
    expect(text).toContain("Code Server");
  });

  test("clicking outside closes the IDE dropdown", async ({ page }) => {
    const trigger = page.locator(".ide-trigger");
    await trigger.click();

    const menu = page.locator(".ide-menu");
    await expect(menu).toBeVisible({ timeout: UI_TIMEOUT });

    // Click anywhere else (like the sidebar)
    await page.locator(".sidebar").click();
    await expect(menu).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("clicking an IDE option closes the dropdown", async ({
    page,
    context,
  }) => {
    const trigger = page.locator(".ide-trigger");
    await trigger.click();

    const menu = page.locator(".ide-menu");
    await expect(menu).toBeVisible({ timeout: UI_TIMEOUT });

    // Mock window.open to avoid actual popups blocking tests
    await page.evaluate(() => {
      window.open = () => null;
    });

    // Click an option
    const firstOption = menu.locator(".ide-option").first();
    await firstOption.click();

    // Menu should disappear
    await expect(menu).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("IDE dropdown separates browser-based and local IDEs", async ({
    page,
  }) => {
    const trigger = page.locator(".ide-trigger");
    await trigger.click();

    const menu = page.locator(".ide-menu");
    await expect(menu).toBeVisible({ timeout: UI_TIMEOUT });

    const headers = menu.locator(".ide-menu-header");
    const headerTexts = await headers.allTextContents();

    // Should have "Open in IDE" section
    expect(headerTexts).toContain("Open in IDE");

    // Code Server should be in the menu
    const text = await menu.innerText();
    expect(text).toContain("Code Server");

    // Code Server should appear under "Open in IDE" section (browser-based IDEs come first)
    // Verify structure by checking that "Open in IDE" header appears before "Code Server"
    const openInIDEIndex = text.indexOf("Open in IDE");
    const codeServerIndex = text.indexOf("Code Server");
    expect(codeServerIndex).toBeGreaterThan(openInIDEIndex);

    // If local IDEs are detected, they should be in "Open on Local Host" section
    const openOnLocalHostIndex = text.indexOf("Open on Local Host");
    if (openOnLocalHostIndex !== -1) {
      // Code Server should appear before the "Open on Local Host" section
      expect(codeServerIndex).toBeLessThan(openOnLocalHostIndex);
      // Local IDE entries should appear after this header
      const options = menu.locator(".ide-option");
      expect(await options.count()).toBeGreaterThan(1); // At least browser + local IDE
    }
  });
});
