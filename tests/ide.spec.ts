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

    test("clicking an IDE option closes the dropdown", async ({ page, context }) => {
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
});
