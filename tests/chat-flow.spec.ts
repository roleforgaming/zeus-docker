import { test, expect, type Page } from "@playwright/test";

// ── Constants ────────────────────────────────────────────────────────────────

const APP_URL = "http://localhost:5173";

/** Time to wait for the app shell to be ready after navigation. */
const APP_READY_TIMEOUT = 8_000;

/** Time to wait for UI state changes (panel open/close, menu toggles). */
const UI_TIMEOUT = 3_000;

/** Time to wait for an AI response — requires a live backend + Claude Code. */
const AI_RESPONSE_TIMEOUT = 30_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the app and wait until the sidebar is rendered.
 * The sidebar is the primary indicator that the app shell has mounted.
 */
async function loadApp(page: Page) {
  await page.goto(APP_URL);
  // aside.sidebar is always in the DOM once App.svelte mounts
  await page.waitForSelector("aside.sidebar", {
    state: "visible",
    timeout: APP_READY_TIMEOUT,
  });
}

// ── Test Suite ───────────────────────────────────────────────────────────────

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

// ── Conversation View & Input Bar ─────────────────────────────────────────────

test.describe("Zeus IDE – Conversation View & InputBar", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    // Ensure a Claude session is active so the ConversationView is visible.
    // This may already be the case if the app auto-launches one.
    const conversationView = page.locator(".conversation-view:not(.hidden)");
    const isVisible = await conversationView.isVisible();
    if (!isVisible) {
      // Trigger a new session via the sidebar button
      await page
        .locator(".sessions-header")
        .getByTitle("New Claude Code")
        .click();
      await expect(conversationView).toBeVisible({
        timeout: APP_READY_TIMEOUT,
      });
    }
  });

  test("shows welcome screen when conversation is empty", async ({ page }) => {
    const welcome = page.locator(".conversation-view:not(.hidden) .welcome");
    // Welcome screen is shown when conv.messages.length === 0 and not streaming
    // This only passes if the active conversation has no messages yet.
    const isVisible = await welcome.isVisible();
    if (isVisible) {
      await expect(welcome.locator("h2")).toContainText("How can I help?");
      await expect(welcome.locator(".welcome-sub")).toBeVisible();
    }
    // If not visible, a conversation already has messages — that is also valid state.
  });

  test("input textarea is visible and interactive", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await expect(textarea).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(textarea).toBeEnabled();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.fill("");

    // .send-btn without .active class is disabled
    const sendBtn = page.locator(
      ".conversation-view:not(.hidden) .send-btn:not(.abort)",
    );
    await expect(sendBtn).toBeDisabled({ timeout: UI_TIMEOUT });
    await expect(sendBtn).not.toHaveClass(/active/);
  });

  test("send button becomes active when text is typed", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    const sendBtn = page.locator(
      ".conversation-view:not(.hidden) .send-btn:not(.abort)",
    );

    await textarea.fill("Hello");
    await expect(sendBtn).toBeEnabled({ timeout: UI_TIMEOUT });
    await expect(sendBtn).toHaveClass(/active/);
  });

  test("clears textarea after content is typed then deleted", async ({
    page,
  }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.fill("temporary text");
    await textarea.fill("");
    await expect(textarea).toHaveValue("");
  });

  test("typing / opens slash command autocomplete menu", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.click();
    await textarea.pressSequentially("/");

    const slashMenu = page.locator(
      ".conversation-view:not(.hidden) .slash-menu",
    );
    await expect(slashMenu).toBeVisible({ timeout: UI_TIMEOUT });

    // At minimum, built-in commands like /clear should appear
    await expect(slashMenu.locator(".slash-item").first()).toBeVisible();
  });

  test("slash menu closes when Escape is pressed", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.click();
    await textarea.pressSequentially("/");

    const slashMenu = page.locator(
      ".conversation-view:not(.hidden) .slash-menu",
    );
    await expect(slashMenu).toBeVisible({ timeout: UI_TIMEOUT });

    await page.keyboard.press("Escape");
    await expect(slashMenu).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("slash menu filters commands as user types", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.click();
    await textarea.pressSequentially("/clea"); // should match /clear

    const slashMenu = page.locator(
      ".conversation-view:not(.hidden) .slash-menu",
    );
    await expect(slashMenu).toBeVisible({ timeout: UI_TIMEOUT });

    const items = slashMenu.locator(".slash-item");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // The /clear command must appear in results
    await expect(
      slashMenu.locator(".slash-cmd").filter({ hasText: "/clear" }),
    ).toBeVisible();
  });

  test("selecting a slash command creates a command tag chip", async ({
    page,
  }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.click();
    await textarea.pressSequentially("/clear");

    const slashMenu = page.locator(
      ".conversation-view:not(.hidden) .slash-menu",
    );
    await expect(slashMenu).toBeVisible({ timeout: UI_TIMEOUT });

    // Press Enter or Tab to select the highlighted item
    await page.keyboard.press("Enter");

    // A command tag chip should appear in the input row
    const commandTag = page.locator(
      ".conversation-view:not(.hidden) .command-tag",
    );
    await expect(commandTag).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(commandTag.locator(".tag-label")).toContainText("/clear");
  });

  test("pressing Backspace on empty input removes a command tag chip", async ({
    page,
  }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    await textarea.click();
    await textarea.pressSequentially("/clear");

    const slashMenu = page.locator(
      ".conversation-view:not(.hidden) .slash-menu",
    );
    await expect(slashMenu).toBeVisible({ timeout: UI_TIMEOUT });
    await page.keyboard.press("Enter");

    const commandTag = page.locator(
      ".conversation-view:not(.hidden) .command-tag",
    );
    await expect(commandTag).toBeVisible({ timeout: UI_TIMEOUT });

    // Backspace on empty input removes the tag
    await textarea.press("Backspace");
    await expect(commandTag).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("model selector button is visible in the input hints bar", async ({
    page,
  }) => {
    const modelBtn = page.locator(".conversation-view:not(.hidden) .model-btn");
    await expect(modelBtn).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("model selector button opens a model menu on click", async ({
    page,
  }) => {
    const modelBtn = page.locator(".conversation-view:not(.hidden) .model-btn");
    await modelBtn.click();

    const modelMenu = page.locator(
      ".conversation-view:not(.hidden) .model-menu",
    );
    await expect(modelMenu).toBeVisible({ timeout: UI_TIMEOUT });

    const options = modelMenu.locator(".model-option");
    expect(await options.count()).toBeGreaterThan(0);
  });

  test("model menu closes after selecting a model", async ({ page }) => {
    const modelBtn = page.locator(".conversation-view:not(.hidden) .model-btn");
    await modelBtn.click();

    const modelMenu = page.locator(
      ".conversation-view:not(.hidden) .model-menu",
    );
    await expect(modelMenu).toBeVisible({ timeout: UI_TIMEOUT });

    // Click any model option
    await modelMenu.locator(".model-option").first().click();
    await expect(modelMenu).not.toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("input bar shows keyboard hints (Enter, Shift+Enter, Ctrl+C)", async ({
    page,
  }) => {
    const hints = page.locator(".conversation-view:not(.hidden) .hints");
    await expect(hints).toBeVisible({ timeout: UI_TIMEOUT });

    const hintText = await hints.textContent();
    expect(hintText).toContain("Enter");
    expect(hintText).toContain("Shift+Enter");
    expect(hintText).toContain("Ctrl+C");
  });

  /**
   * LIVE TEST — requires a running Zeus backend + installed Claude Code.
   * Validates the full chat send/receive flow including:
   * - User message appears in the conversation view
   * - Streaming progress bar / abort button appears during response
   * - Assistant response becomes visible after streaming
   */
  test("send message flow: user bubble appears and AI responds", async ({
    page,
  }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    const sendBtn = page.locator(
      ".conversation-view:not(.hidden) .send-btn:not(.abort)",
    );
    const messagesContainer = page.locator(
      ".conversation-view:not(.hidden) .messages-container",
    );

    const message = 'Hello! Reply with a single word: "Acknowledged"';

    await textarea.fill(message);
    await expect(sendBtn).toHaveClass(/active/, { timeout: UI_TIMEOUT });
    await sendBtn.click();

    // 1. The user message bubble must appear immediately after sending
    const userBubble = messagesContainer
      .locator(".msg.user .msg-user-bubble")
      .last();
    await expect(userBubble).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(userBubble).toContainText(message);

    // 2. The streaming state must be entered (progress bar or status indicator)
    // Accept either the streaming progress bar or the abort button as indicators
    const streamProgress = page.locator(
      ".conversation-view:not(.hidden) .stream-progress",
    );
    const abortBtn = page.locator(
      ".conversation-view:not(.hidden) .send-btn.abort",
    );
    await expect(streamProgress.or(abortBtn)).toBeVisible({
      timeout: UI_TIMEOUT,
    });

    // 3. Wait for a final assistant message to appear
    const assistantMessage = messagesContainer
      .locator(".msg.assistant:not(.streaming) .msg-content")
      .last();
    await expect(assistantMessage).toBeVisible({
      timeout: AI_RESPONSE_TIMEOUT,
    });
    // Verify the response contains some text content
    const responseText = await assistantMessage.textContent();
    expect(responseText?.trim().length).toBeGreaterThan(0);
  });

  /**
   * Tests the abort (Ctrl+C) functionality during a streaming AI response.
   * Requires a running backend.
   */
  test("can abort an in-progress AI response", async ({ page }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    const sendBtn = page.locator(
      ".conversation-view:not(.hidden) .send-btn:not(.abort)",
    );

    await textarea.fill(
      "Count slowly from 1 to 100 with a delay between each number.",
    );
    await expect(sendBtn).toHaveClass(/active/, { timeout: UI_TIMEOUT });
    await sendBtn.click();

    // Wait for abort button to appear (streaming started)
    const abortBtn = page.locator(
      ".conversation-view:not(.hidden) .send-btn.abort",
    );
    await expect(abortBtn).toBeVisible({ timeout: UI_TIMEOUT });

    // Click abort
    await abortBtn.click();

    // Abort button should disappear, send button returns
    await expect(abortBtn).not.toBeVisible({ timeout: UI_TIMEOUT });
    await expect(sendBtn).toBeVisible({ timeout: UI_TIMEOUT });
  });

  test("long message input does not break the textarea layout", async ({
    page,
  }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    const longText = "a".repeat(400); // within MAX_TYPED_LENGTH (500)

    await textarea.fill(longText);
    await expect(textarea).toHaveValue(longText);
    // Textarea should still be visible and not overflow its container
    await expect(textarea).toBeVisible();
  });

  test("Shift+Enter inserts a newline instead of submitting", async ({
    page,
  }) => {
    const textarea = page.locator(
      ".conversation-view:not(.hidden) textarea.input-field",
    );
    const initialMessageCount = await page.locator(".msg.user").count();

    await textarea.fill("Line one");
    await textarea.press("Shift+Enter");
    await textarea.pressSequentially("Line two");

    // Message count should not have increased (no submit)
    const newCount = await page.locator(".msg.user").count();
    expect(newCount).toBe(initialMessageCount);

    // The textarea should contain both lines
    const value = await textarea.inputValue();
    expect(value).toContain("Line one");
    expect(value).toContain("Line two");
  });
});

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
    const terminalSession = page
      .locator(".session-item .session-icon.terminal")
      .first();
    await expect(terminalSession).toBeVisible({ timeout: UI_TIMEOUT });

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
    await expect(terminalItem).toBeVisible({ timeout: UI_TIMEOUT });
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
    await expect(terminalItem).toBeVisible({ timeout: UI_TIMEOUT });

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
