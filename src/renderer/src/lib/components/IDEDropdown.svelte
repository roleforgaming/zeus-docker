<script lang="ts">
  import { ideStore } from "../stores/ide.svelte.js";
  import { workspaceStore } from "../stores/workspace.svelte.js";
  import { uiStore } from "../stores/ui.svelte.js";
  import { createIDEService } from "../services/ide.js";
  import { io } from "socket.io-client";

  let isOpen = $state(false);
  let isOpeningLocalIDE = $state(false);
  let ideService = createIDEService(io(window.location.origin, {
    transports: ["websocket", "polling"],
  }));

  /** IDE icon map — returns SVG path content for each known IDE */
  function ideIcon(iconId: string): {
    path: string;
    viewBox: string;
    color: string;
  } {
    switch (iconId) {
      case "vscode":
        return {
          path: "M17.58 2.58L12.7 7.47 6.93 3.07 2 5.13v13.74l4.93 2.06 5.77-4.4 4.88 4.89L22 18.87V5.13l-4.42-2.55zM6 15.6V8.4l3.5 3.6L6 15.6zm11 1.27l-4-3.87 4-3.87v7.74z",
          viewBox: "0 0 24 24",
          color: "#007ACC",
        };
      case "cursor":
        return {
          path: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
          viewBox: "0 0 24 24",
          color: "#00D4FF",
        };
      case "antigravity":
        return {
          path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4l6 6h-4v4h-4v-4H6l6-6z",
          viewBox: "0 0 24 24",
          color: "#FF6B6B",
        };
      case "windsurf":
        return {
          path: "M2 20L12 4l10 16H2zm10-4a2 2 0 100-4 2 2 0 000 4z",
          viewBox: "0 0 24 24",
          color: "#00BFA5",
        };
      case "zed":
        return {
          path: "M3 3h18L3 21h18",
          viewBox: "0 0 24 24",
          color: "#F9CB00",
        };
      case "idea":
        return {
          path: "M12 2a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2zM9 21v-1h6v1a1 1 0 01-1 1h-4a1 1 0 01-1-1z",
          viewBox: "0 0 24 24",
          color: "#FE315D",
        };
      case "webstorm":
        return {
          path: "M12 2a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2zM9 21v-1h6v1a1 1 0 01-1 1h-4a1 1 0 01-1-1z",
          viewBox: "0 0 24 24",
          color: "#00CDD7",
        };
      case "sublime":
        return {
          path: "M2 8l10-4 10 4M2 16l10 4 10-4M2 12l10-4 10 4",
          viewBox: "0 0 24 24",
          color: "#FF9800",
        };
      case "vim":
        return {
          path: "M2 4l5 8-5 8h4l5-8-5-8H2zm10 0l5 8-5 8h4l5-8-5-8h-4z",
          viewBox: "0 0 24 24",
          color: "#019833",
        };
      case "codeserver":
        return {
          path: "M17.58 2.58L12.7 7.47 6.93 3.07 2 5.13v13.74l4.93 2.06 5.77-4.4 4.88 4.89L22 18.87V5.13l-4.42-2.55zM6 15.6V8.4l3.5 3.6L6 15.6zm11 1.27l-4-3.87 4-3.87v7.74z",
          viewBox: "0 0 24 24",
          color: "#3B82F6",
        };
      default:
        return {
          path: "M16 18l6-6-6-6M8 6l-6 6 6 6",
          viewBox: "0 0 24 24",
          color: "var(--text-secondary)",
        };
    }
  }

  export function toggle() {
    isOpen = !isOpen;
  }

  export function open() {
    isOpen = true;
  }

  export function close() {
    isOpen = false;
  }

  async function openIDE(cmd: string, ideId: string) {
    if (!workspaceStore.active) return;
    const workspacePath = workspaceStore.active.path;
    try {
      const result = await ideStore.open(cmd, workspacePath) as { success: boolean; error?: string; url?: string };

      // Check if this is a browser-based IDE with a URL (code-server or http/https)
      if (result.success && result.url) {
        // For code-server, open the URL in a new tab
        if (ideId === 'codeserver') {
          window.open(result.url, "_blank", "noopener,noreferrer");
          uiStore.showToast(`Opening in Code Server...`, "success");
        } else {
          // For other URLs, also open in new tab
          window.open(result.url, "_blank", "noopener,noreferrer");
          uiStore.showToast(`Opening in browser...`, "success");
        }
      } else if (result.success) {
        // Desktop IDE (no URL returned)
        uiStore.showToast(`Opening in ${cmd}...`, "success");
      } else {
        uiStore.showToast(`Failed: ${result.error}`, "error");
      }
    } catch (err: any) {
      uiStore.showToast(
        `Failed to open ${cmd}: ${err?.message ?? err}`,
        "error",
      );
    } finally {
      isOpen = false;
    }
  }

  async function openLocalIDE(ideType: string, ideName: string) {
    if (!workspaceStore.active) return;
    if (isOpeningLocalIDE) return;

    isOpeningLocalIDE = true;
    const workspacePath = workspaceStore.active.path;

    try {
      const response = await ideService.openLocalIDE(ideType, workspacePath);

      if (response.success) {
        // If a URL is returned (e.g., for code-server), open it in a new tab
        if (response.url) {
          window.open(response.url, "_blank", "noopener,noreferrer");
          uiStore.showToast(`Opening ${ideName}...`, "success");
        } else {
          // For IDEs that launch without a URL, just show success message
          uiStore.showToast(`Opening ${ideName} on local host...`, "success");
        }
      } else {
        const errorMsg = response.error || response.message || "Unknown error";
        uiStore.showToast(`Failed to open ${ideName}: ${errorMsg}`, "error");
      }
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err);
      uiStore.showToast(
        `Failed to launch ${ideName}: ${errorMsg}`,
        "error",
      );
    } finally {
      isOpeningLocalIDE = false;
      isOpen = false;
    }
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (isOpen && !target.closest(".ide-dropdown")) {
      isOpen = false;
    }
  }

  // Filter IDEs: browser-based for "Open in IDE", local for "Open on Local Host"
  const browserIDEs = $derived(ideStore.list.filter(ide => ide.type === 'browser'));
  const localIDEs = $derived(ideStore.list.filter(ide => ide.type === 'local'));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<svelte:window onclick={handleWindowClick} />

<div class="ide-dropdown">
  <button
    class="ide-trigger"
    class:active={isOpen}
    onclick={toggle}
    title="Open in IDE"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      ><polyline points="16 18 22 12 16 6" /><polyline
        points="8 6 2 12 8 18"
      /></svg
    >
    <svg
      class="caret"
      class:open={isOpen}
      width="8"
      height="8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"><polyline points="6 9 12 15 18 9" /></svg
    >
  </button>

  {#if isOpen}
    <div class="ide-menu">
      {#if browserIDEs.length > 0}
        <div class="ide-menu-header">Open in IDE</div>
        {#each browserIDEs as ide (ide.id)}
          {@const icon = ideIcon(ide.icon)}
          <button class="ide-option" onclick={() => openIDE(ide.cmd, ide.id)}>
            <div class="ide-icon-wrap" style="background: {icon.color}1a;">
              <svg
                width="16"
                height="16"
                viewBox={icon.viewBox}
                fill="none"
                stroke={icon.color}
                stroke-width="1.5"
              >
                <path d={icon.path} />
              </svg>
            </div>
            <div class="ide-info">
              <span class="ide-name">{ide.name}</span>
              <span class="ide-cmd">{ide.cmd}</span>
            </div>
          </button>
        {/each}
      {/if}

      {#if localIDEs.length > 0}
        {#if browserIDEs.length > 0}
          <div class="ide-menu-divider"></div>
        {/if}
        <div class="ide-menu-header">Open on Local Host</div>
        {#each localIDEs as ide (ide.id)}
          {@const icon = ideIcon(ide.icon)}
          <button
            class="ide-option"
            class:disabled={isOpeningLocalIDE}
            disabled={isOpeningLocalIDE}
            onclick={() => openLocalIDE(ide.cmd, ide.name)}
            title="Open in {ide.name} on local machine"
          >
            <div class="ide-icon-wrap" style="background: {icon.color}1a;">
              <svg
                width="16"
                height="16"
                viewBox={icon.viewBox}
                fill="none"
                stroke={icon.color}
                stroke-width="1.5"
              >
                <path d={icon.path} />
              </svg>
            </div>
            <div class="ide-info">
              <span class="ide-name">{ide.name}</span>
              <span class="ide-cmd">Local Host</span>
            </div>
            {#if isOpeningLocalIDE}
              <div class="ide-spinner"></div>
            {/if}
          </button>
        {/each}
      {/if}

      {#if browserIDEs.length === 0 && localIDEs.length === 0}
        <div class="ide-empty">No IDEs detected</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ide-dropdown {
    position: relative;
  }

  .ide-trigger {
    display: flex;
    align-items: center;
    gap: 3px;
    width: auto;
    height: 30px;
    padding: 0 8px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .ide-trigger:hover,
  .ide-trigger.active {
    background: var(--border);
    color: var(--text-primary);
  }
  .caret {
    transition: transform 150ms ease;
    opacity: 0.5;
  }
  .caret.open {
    transform: rotate(180deg);
    opacity: 1;
  }

  .ide-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 220px;
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    z-index: 200;
    animation: ide-menu-in 120ms ease;
  }
  @keyframes ide-menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .ide-menu-header {
    padding: 6px 10px 4px;
    font-size: 10px;
    font-weight: 600;
    color: var(--border-strong);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ide-empty {
    padding: 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }

  .ide-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background 80ms ease;
  }
  .ide-option:hover {
    background: var(--border);
  }

  .ide-icon-wrap {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .ide-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .ide-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  .ide-cmd {
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
</style>
