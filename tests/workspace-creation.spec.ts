import { test, expect } from "@playwright/test";
import { loadApp } from "./helpers/app";

test.describe("Zeus IDE – Workspace creation", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("workspace creation returns a workspace object", async ({ page }) => {
    const result = await page.evaluate(async () => {
      return await window.zeus.workspace.add(
        "/tmp/zeus-test-workspace-" + Date.now(),
      );
    });

    // Verify the result is an object with path and name
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("name");
    expect(typeof result.path).toBe("string");
    expect(typeof result.name).toBe("string");
  });

  test("workspace add method exists and is callable", async ({ page }) => {
    const hasAddMethod = await page.evaluate(() => {
      return typeof window.zeus.workspace.add === "function";
    });
    expect(hasAddMethod).toBe(true);
  });
});
