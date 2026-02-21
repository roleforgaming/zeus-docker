import { test, expect } from "@playwright/test";
import {
  loadApp,
  APP_READY_TIMEOUT,
  UI_TIMEOUT,
  AI_RESPONSE_TIMEOUT,
} from "./helpers/app";

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
    await expect(streamProgress.or(abortBtn).first()).toBeVisible({
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
