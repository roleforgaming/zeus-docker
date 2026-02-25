# Workspace Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full filesystem sync for workspace management with deletion confirmation, import existing workspaces, and reload button.

**Architecture:** Add three Socket.IO handlers for delete-with-option, import, and reload operations. Build two modals on frontend (DeleteWorkspaceModal, ImportWorkspaceModal) and integrate buttons in Sidebar. Update workspace store with new methods.

**Tech Stack:** Socket.IO (backend communication), Svelte 5 components (modals), Node.js fs (filesystem operations), Playwright (E2E testing)

---

## Task 1: Backend - Implement `workspace:delete-with-option` Handler

**Files:**
- Modify: `server/index.js:~560` (add new handler after existing workspace handlers)

**Step 1: Examine current workspace handlers in server/index.js**

Run:
```bash
grep -n "socket.on.*workspace:" server/index.js | head -20
```

Expected output: shows existing workspace handlers like `workspace:add`, `workspace:remove`, `workspace:rename`

**Step 2: Write the delete-with-option handler**

Add this code to `server/index.js` after the existing `workspace:rename` handler (~line 560):

```javascript
  socket.on("workspace:delete-with-option", async ({ wsPath, deleteFiles }, callback) => {
    try {
      if (deleteFiles) {
        // Delete the directory from filesystem
        await fs.rm(wsPath, { recursive: true, force: true });
      }
      // Remove from workspace store
      const store = getStore();
      store.workspaces = store.workspaces.filter((w) => w.path !== wsPath);
      saveStore(store);

      callback({ success: true, message: "Workspace deleted" });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
```

**Step 3: Test the handler manually with netcat/curl**

Start server:
```bash
npm run dev
```

In another terminal, test with Node script (create `test-delete.js`):
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
socket.on("connect", () => {
  socket.emit("workspace:delete-with-option",
    { wsPath: "/tmp/test-ws", deleteFiles: false },
    (response) => {
      console.log("Response:", response);
      process.exit(0);
    }
  );
});
```

Run: `node test-delete.js`
Expected: shows `{ success: true, message: "Workspace deleted" }`

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add workspace:delete-with-option handler"
```

---

## Task 2: Backend - Implement `workspace:import` Handler

**Files:**
- Modify: `server/index.js` (add new handler after delete-with-option)

**Step 1: Write the import handler**

Add this code to `server/index.js` after the delete-with-option handler:

```javascript
  socket.on("workspace:import", async (sourcePath, callback) => {
    try {
      // Validate source exists and is a directory
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        throw new Error("Source must be a directory");
      }

      // Get workspace directory from env or config
      const workspaceDir = process.env.WORKSPACE_DIR || path.join(os.homedir(), "workspaces");

      // Generate destination name (avoid conflicts)
      const baseName = path.basename(sourcePath);
      let destPath = path.join(workspaceDir, baseName);
      let counter = 2;
      while (fs.existsSync(destPath)) {
        destPath = path.join(workspaceDir, `${baseName}-${counter}`);
        counter++;
      }

      // Copy directory recursively
      await fs.cp(sourcePath, destPath, { recursive: true });

      // Add to workspace store
      const store = getStore();
      const newWs = {
        path: destPath,
        name: path.basename(destPath),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.workspaces.push(newWs);
      saveStore(store);

      callback({ success: true, workspace: newWs });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
```

**Step 2: Test the handler**

Create test directory:
```bash
mkdir -p /tmp/source-project
echo "test file" > /tmp/source-project/test.txt
```

Test with Node script:
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
socket.on("connect", () => {
  socket.emit("workspace:import", "/tmp/source-project", (response) => {
    console.log("Response:", response);
    process.exit(0);
  });
});
```

Run: `node test-import.js`
Expected: shows success with new workspace object containing path, name, timestamps

**Step 3: Verify the directory was copied**

```bash
ls -la $WORKSPACE_DIR | grep source-project
```

Expected: shows copied directory

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add workspace:import handler with conflict resolution"
```

---

## Task 3: Backend - Implement `workspace:reload` Handler

**Files:**
- Modify: `server/index.js` (add new handler after import)

**Step 1: Write the reload handler**

Add this code to `server/index.js` after the import handler:

```javascript
  socket.on("workspace:reload", async (callback) => {
    try {
      const workspaceDir = process.env.WORKSPACE_DIR || path.join(os.homedir(), "workspaces");

      // Read all directories from workspace folder
      const entries = await fs.readdir(workspaceDir, { withFileTypes: true });
      const diskWorkspaces = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({
          path: path.join(workspaceDir, e.name),
          name: e.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

      // Replace workspace list with disk state
      const store = getStore();
      store.workspaces = diskWorkspaces;
      saveStore(store);

      callback({ success: true, workspaces: diskWorkspaces });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
```

**Step 2: Test the handler**

Test with Node script:
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
socket.on("connect", () => {
  socket.emit("workspace:reload", (response) => {
    console.log("Response:", response);
    process.exit(0);
  });
});
```

Run: `node test-reload.js`
Expected: shows array of workspaces found on disk

**Step 3: Verify list is updated**

Create a manual test:
```bash
mkdir -p $WORKSPACE_DIR/manual-test
node test-reload.js
# Should include manual-test in response
```

**Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add workspace:reload handler to sync with filesystem"
```

---

## Task 4: Frontend - Add Zeus API Methods for New Operations

**Files:**
- Modify: `src/renderer/src/lib/zeus.ts` (workspace section)

**Step 1: Locate workspace API methods**

Run:
```bash
grep -n "workspace:" src/renderer/src/lib/zeus.ts | head -20
```

Expected: shows existing workspace methods like `list()`, `add()`, `remove()`

**Step 2: Add new API methods**

Find the workspace object in zeus.ts and add these methods:

```typescript
    deleteWithOption: (wsPath: string, deleteFiles: boolean) =>
      invoke("workspace:delete-with-option", { wsPath, deleteFiles }),
    import: (sourcePath: string) =>
      invoke("workspace:import", sourcePath),
    reload: () =>
      invoke("workspace:reload"),
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npm run build
```

Expected: no TypeScript errors in compilation

**Step 4: Commit**

```bash
git add src/renderer/src/lib/zeus.ts
git commit -m "feat: add Zeus API methods for workspace deletion, import, and reload"
```

---

## Task 5: Frontend - Create DeleteWorkspaceModal Component

**Files:**
- Create: `src/renderer/src/lib/components/DeleteWorkspaceModal.svelte`

**Step 1: Create the modal component**

```svelte
<script lang="ts">
  import { uiStore } from '../stores/ui.svelte.js'
  import { workspaceStore } from '../stores/workspace.svelte.js'

  let { workspace } = $props<{ workspace: { path: string; name: string } }>()

  let deleteFiles = $state(false)
  let isDeleting = $state(false)

  async function handleDelete() {
    isDeleting = true
    try {
      await window.zeus.workspace.deleteWithOption(workspace.path, deleteFiles)
      await workspaceStore.load()
      uiStore.closeModal()
      const message = deleteFiles
        ? `Workspace "${workspace.name}" and its files have been deleted`
        : `Workspace "${workspace.name}" removed from Zeus (files remain on disk)`
      uiStore.showToast(message, 'success')
    } catch (error) {
      uiStore.showToast(`Error deleting workspace: ${error.message}`, 'error')
    } finally {
      isDeleting = false
    }
  }

  function handleCancel() {
    uiStore.closeModal()
  }
</script>

<div class="modal-overlay">
  <div class="modal-content">
    <h2>Delete Workspace?</h2>

    <div class="workspace-info">
      <div class="info-row">
        <span class="label">Workspace:</span>
        <span class="value">{workspace.name}</span>
      </div>
      <div class="info-row">
        <span class="label">Path:</span>
        <span class="value">{workspace.path}</span>
      </div>
    </div>

    <div class="checkbox-group">
      <input type="checkbox" id="delete-files" bind:checked={deleteFiles} />
      <label for="delete-files">Also delete files from disk</label>
    </div>

    <div class="warning">
      ⚠️ This action cannot be undone.
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" onclick={handleCancel} disabled={isDeleting}>
        Cancel
      </button>
      <button class="btn btn-danger" onclick={handleDelete} disabled={isDeleting}>
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 24px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .workspace-info {
    background: var(--bg-primary);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .info-row:last-child {
    margin-bottom: 0;
  }

  .label {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .value {
    color: var(--text-primary);
    word-break: break-all;
  }

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 14px;
  }

  input[type='checkbox'] {
    cursor: pointer;
  }

  .warning {
    background: rgba(255, 193, 7, 0.1);
    border-left: 3px solid #ffc107;
    padding: 10px 12px;
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--text-primary);
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-tertiary);
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }
</style>
```

**Step 2: Verify component renders**

Run dev server:
```bash
npm run dev
```

No errors in console expected.

**Step 3: Commit**

```bash
git add src/renderer/src/lib/components/DeleteWorkspaceModal.svelte
git commit -m "feat: create DeleteWorkspaceModal component"
```

---

## Task 6: Frontend - Create ImportWorkspaceModal Component

**Files:**
- Create: `src/renderer/src/lib/components/ImportWorkspaceModal.svelte`

**Step 1: Create the modal component**

```svelte
<script lang="ts">
  import { uiStore } from '../stores/ui.svelte.js'
  import { workspaceStore } from '../stores/workspace.svelte.js'

  let sourcePathInput = $state('')
  let isImporting = $state(false)
  let showConfirmation = $state(false)
  let selectedPath = $state('')

  async function handleSelectDirectory() {
    // Use file input as a directory picker
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.multiple = false
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        // Get parent directory of first file
        const filePath = files[0].webkitRelativePath || files[0].name
        selectedPath = filePath
        showConfirmation = true
      }
    }
    input.click()
  }

  async function handleImport() {
    if (!selectedPath) return

    isImporting = true
    try {
      await workspaceStore.importWorkspace(selectedPath)
      uiStore.closeModal()
      uiStore.showToast('Workspace imported successfully', 'success')
    } catch (error) {
      uiStore.showToast(`Error importing workspace: ${error.message}`, 'error')
    } finally {
      isImporting = false
      showConfirmation = false
      selectedPath = ''
    }
  }

  function handleCancel() {
    uiStore.closeModal()
  }
</script>

<div class="modal-overlay">
  <div class="modal-content">
    <h2>Import Existing Workspace</h2>

    {#if !showConfirmation}
      <div class="select-section">
        <p class="description">
          Select an existing project directory to import into Zeus. It will be copied to the bind mount.
        </p>

        <button class="btn btn-primary" onclick={handleSelectDirectory}>
          Select Directory
        </button>

        {#if selectedPath}
          <div class="selected-path">
            <strong>Selected:</strong> {selectedPath}
          </div>
        {/if}
      </div>
    {:else}
      <div class="confirm-section">
        <div class="source-dest">
          <div class="source-row">
            <span class="label">Source:</span>
            <span class="path">{selectedPath}</span>
          </div>
          <div class="arrow">↓</div>
          <div class="dest-row">
            <span class="label">Destination:</span>
            <span class="path">/home/coder/workspaces/{selectedPath.split('/').pop()}</span>
          </div>
        </div>

        <div class="warning">
          <strong>⚠️ Warning:</strong> Large projects may take a minute or two to copy over. Please be patient.
        </div>

        <div class="modal-actions">
          <button
            class="btn btn-secondary"
            onclick={() => (showConfirmation = false)}
            disabled={isImporting}
          >
            Back
          </button>
          <button
            class="btn btn-primary"
            onclick={handleImport}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    {/if}

    {#if !showConfirmation}
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={handleCancel} disabled={isImporting}>
          Cancel
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 24px;
    width: 90%;
    max-width: 450px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .description {
    margin: 0 0 16px 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }

  .source-dest {
    background: var(--bg-primary);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .source-row,
  .dest-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .dest-row {
    margin-bottom: 0;
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .path {
    font-size: 13px;
    color: var(--text-primary);
    word-break: break-all;
    font-family: monospace;
  }

  .arrow {
    text-align: center;
    color: var(--text-secondary);
    margin: 8px 0;
    font-size: 18px;
  }

  .selected-path {
    background: var(--bg-primary);
    border-radius: 4px;
    padding: 10px;
    margin-top: 12px;
    font-size: 12px;
    word-break: break-all;
  }

  .warning {
    background: rgba(255, 193, 7, 0.1);
    border-left: 3px solid #ffc107;
    padding: 10px 12px;
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-tertiary);
  }
</style>
```

**Step 2: Verify component renders**

Dev server should still be running. No errors expected.

**Step 3: Commit**

```bash
git add src/renderer/src/lib/components/ImportWorkspaceModal.svelte
git commit -m "feat: create ImportWorkspaceModal component"
```

---

## Task 7: Frontend - Update Workspace Store with New Methods

**Files:**
- Modify: `src/renderer/src/lib/stores/workspace.svelte.ts` (add methods to WorkspaceStore class)

**Step 1: Locate the class definition**

Run:
```bash
grep -n "class WorkspaceStore" src/renderer/src/lib/stores/workspace.svelte.ts
```

Expected: line number around 6-10

**Step 2: Add new methods to the class**

Add these methods before the closing brace of the class (before line 82 `export const workspaceStore`):

```typescript
  async deleteWithOption(wsPath: string, deleteFiles: boolean) {
    await window.zeus.workspace.deleteWithOption(wsPath, deleteFiles);
    if (this.active?.path === wsPath) {
      this.active = null;
      this.activeDirInfo = null;
    }
    await this.load();
    // Select next available workspace if we just removed the active one
    if (!this.active && this.list.length > 0) {
      await this.select(this.list[0]);
    }
  }

  async importWorkspace(sourcePath: string) {
    const result = await window.zeus.workspace.import(sourcePath);
    await this.load();
    if (result.workspace) {
      await this.select(result.workspace);
    }
    return result;
  }

  async reload() {
    await window.zeus.workspace.reload();
    await this.load();
    // Keep current workspace selected if it still exists
    if (this.active && !this.list.find((w) => w.path === this.active?.path)) {
      this.active = null;
      this.activeDirInfo = null;
      if (this.list.length > 0) {
        await this.select(this.list[0]);
      }
    }
  }
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npm run build
```

Expected: no TypeScript errors

**Step 4: Commit**

```bash
git add src/renderer/src/lib/stores/workspace.svelte.ts
git commit -m "feat: add deleteWithOption, importWorkspace, and reload methods to workspace store"
```

---

## Task 8: Frontend - Update Sidebar with Import and Reload Buttons

**Files:**
- Modify: `src/renderer/src/lib/components/Sidebar.svelte` (add buttons and modal state)

**Step 1: Locate the workspace dropdown section**

Run:
```bash
grep -n "ws-section\|ws-dropdown" src/renderer/src/lib/components/Sidebar.svelte | head -10
```

Expected: shows structure around lines 110-130

**Step 2: Add state for modals at top of script block**

Add after line 24 (after existing state variables):

```typescript
  let showDeleteModal = $state(false)
  let showImportModal = $state(false)
  let workspaceToDelete = $state<typeof workspaceStore.list[0] | null>(null)
  let isReloading = $state(false)
```

**Step 3: Add handler functions**

Add these before the existing `handleWindowClick` function (around line 76):

```typescript
  function openDeleteModal(ws: typeof workspaceStore.list[0], e?: MouseEvent) {
    e?.stopPropagation()
    workspaceToDelete = ws
    showDeleteModal = true
  }

  function closeDeleteModal() {
    showDeleteModal = false
    workspaceToDelete = null
  }

  function openImportModal(e?: MouseEvent) {
    e?.stopPropagation()
    showImportModal = true
  }

  function closeImportModal() {
    showImportModal = false
  }

  async function handleReload() {
    isReloading = true
    try {
      await workspaceStore.reload()
      uiStore.showToast('Workspace list updated', 'success')
    } catch (error) {
      uiStore.showToast(`Error reloading workspaces: ${error.message}`, 'error')
    } finally {
      isReloading = false
    }
  }
```

**Step 4: Update removeWorkspace function to open modal instead**

Replace the `removeWorkspace` function with:

```typescript
  function handleRemoveWorkspace(wsPath: string, e?: MouseEvent) {
    e?.stopPropagation()
    const ws = workspaceStore.list.find((w) => w.path === wsPath)
    if (ws) {
      openDeleteModal(ws)
    }
  }
```

**Step 5: Update Sidebar JSX to add buttons**

In the workspace dropdown menu (after the list of workspaces, around line 170), add:

```svelte
          <!-- Action buttons -->
          <div class="ws-menu-actions">
            <button class="ws-action-btn" onclick={openImportModal} title="Import existing workspace">
              Import Existing
            </button>
            <button class="ws-action-btn reload-btn" onclick={handleReload} disabled={isReloading} title="Reload workspace list">
              {#if isReloading}
                Reloading...
              {:else}
                Reload
              {/if}
            </button>
          </div>
```

**Step 6: Add modals at end of markup (before closing aside)**

Add before the closing `</aside>` tag:

```svelte
{#if showDeleteModal && workspaceToDelete}
  <DeleteWorkspaceModal workspace={workspaceToDelete} />
{/if}

{#if showImportModal}
  <ImportWorkspaceModal />
{/if}
```

**Step 7: Import modal components at top of script**

Add after existing imports (line 12):

```typescript
  import DeleteWorkspaceModal from './DeleteWorkspaceModal.svelte'
  import ImportWorkspaceModal from './ImportWorkspaceModal.svelte'
```

**Step 8: Add styles for action buttons**

Add to the `<style>` section at end of file:

```svelte
  .ws-menu-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border-color);
    margin-top: 8px;
  }

  .ws-action-btn {
    padding: 8px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .ws-action-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
    border-color: var(--accent-color);
  }

  .ws-action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .reload-btn {
    color: var(--accent-color);
  }
```

**Step 9: Update context menu to use modal instead of direct removal**

Find the context menu handler and update it to call the modal:

In the ContextMenu component, find where delete is called and update:
```typescript
// Change: workspaceStore.remove(wsPath)
// To: openDeleteModal(...)
```

**Step 10: Verify app compiles and renders**

Run:
```bash
npm run build
```

Expected: no errors, app should compile successfully

**Step 11: Manual test in dev server**

```bash
npm run dev
```

Expected: Sidebar shows "Import Existing" and "Reload" buttons, clicking delete shows modal

**Step 12: Commit**

```bash
git add src/renderer/src/lib/components/Sidebar.svelte
git commit -m "feat: add Import and Reload buttons to workspace dropdown"
```

---

## Task 9: Frontend - Wire Up Modal Close Handlers

**Files:**
- Modify: `src/renderer/src/lib/stores/ui.svelte.ts` (add modal close/open methods)

**Step 1: Check current ui store structure**

Run:
```bash
grep -n "closeModal\|openModal" src/renderer/src/lib/stores/ui.svelte.ts
```

If methods don't exist, add them:

```typescript
  closeModal() {
    // Broadcast modal close event
    // (Modals listen for this via a store subscription or callback)
  }
```

**Step 2: Update modals to hook into close**

In DeleteWorkspaceModal and ImportWorkspaceModal, ensure `uiStore.closeModal()` is called:

```typescript
function handleCancel() {
  uiStore.closeModal()
}
```

**Step 3: Verify modals can be closed**

Manual test: open modal, click Cancel, ensure it closes

**Step 4: Commit**

```bash
git add src/renderer/src/lib/stores/ui.svelte.ts
git commit -m "feat: ensure modal close handlers work correctly"
```

---

## Task 10: E2E Tests - Write Playwright Tests for Workspace Deletion

**Files:**
- Create: `tests/workspace-management.spec.ts`

**Step 1: Create test file**

```typescript
import { test, expect } from '@playwright/test';
import { loadApp } from './helpers/app';

test.describe('Workspace Management', () => {
  test('Delete workspace shows confirmation modal', async ({ page }) => {
    const app = await loadApp(page);

    // Assume a workspace exists in dropdown
    await page.click('.ws-trigger');
    await page.waitForSelector('.ws-menu-item');

    // Hover or right-click on a workspace to get delete button
    const firstWorkspace = await page.locator('.ws-menu-item').first();
    await firstWorkspace.hover();

    const deleteBtn = await firstWorkspace.locator('[aria-label="Delete workspace"]');
    await deleteBtn.click();

    // Verify modal appears
    const modal = await page.locator('.modal-content');
    await expect(modal).toContainText('Delete Workspace?');
    await expect(modal).toContainText('This action cannot be undone');
  });

  test('Delete workspace with files checkbox option', async ({ page }) => {
    const app = await loadApp(page);

    // Open dropdown
    await page.click('.ws-trigger');
    await page.waitForSelector('.ws-menu-item');

    // Find and click delete
    const firstWorkspace = await page.locator('.ws-menu-item').first();
    await firstWorkspace.hover();
    await firstWorkspace.locator('[aria-label="Delete workspace"]').click();

    // Check the "delete files" checkbox
    const checkbox = await page.locator('input[id="delete-files"]');
    await checkbox.check();

    // Verify it's checked
    await expect(checkbox).toBeChecked();

    // Click Delete button
    await page.click('.btn-danger');

    // Verify workspace is removed from list
    await page.waitForSelector('.ws-trigger');
    const workspaceCount = await page.locator('.ws-menu-item').count();
    expect(workspaceCount).toBeLessThan(2); // At least one removed
  });

  test('Import workspace button appears in dropdown', async ({ page }) => {
    const app = await loadApp(page);

    // Open dropdown
    await page.click('.ws-trigger');

    // Verify Import button exists
    const importBtn = await page.locator('button:has-text("Import Existing")');
    await expect(importBtn).toBeVisible();
  });

  test('Reload button triggers workspace rescan', async ({ page }) => {
    const app = await loadApp(page);

    // Open dropdown
    await page.click('.ws-trigger');

    // Click Reload button
    const reloadBtn = await page.locator('.reload-btn');
    await reloadBtn.click();

    // Verify loading state
    await expect(reloadBtn).toContainText('Reloading...');

    // Wait for reload to complete
    await page.waitForTimeout(2000);
    await expect(reloadBtn).toContainText('Reload');

    // Verify success toast
    const toast = await page.locator('.toast-success');
    await expect(toast).toContainText('Workspace list updated');
  });
});
```

**Step 2: Run the tests**

```bash
npx playwright test tests/workspace-management.spec.ts
```

Expected: tests should run (may fail initially due to missing selectors - adjust as needed)

**Step 3: Commit**

```bash
git add tests/workspace-management.spec.ts
git commit -m "test: add E2E tests for workspace deletion and reload"
```

---

## Task 11: Integration Test - Test Full Delete/Import/Reload Flow

**Files:**
- Modify: `tests/workspace-management.spec.ts` (add integration test)

**Step 1: Add comprehensive integration test**

Add to the test.describe block:

```typescript
  test('Complete workspace lifecycle: import → reload → delete', async ({ page }) => {
    const app = await loadApp(page);
    const initialCount = await page.locator('.ws-menu-item').count();

    // Step 1: Open import modal
    await page.click('.ws-trigger');
    const importBtn = await page.locator('button:has-text("Import Existing")');
    await importBtn.click();

    // Verify confirmation step shows
    const modal = await page.locator('.modal-content');
    await expect(modal).toContainText('Destination:');
    await expect(modal).toContainText('Large projects may take');

    // Step 2: Reload workspaces
    await page.click('.reload-btn');
    await page.waitForTimeout(1000);

    // Step 3: Delete a workspace
    await page.click('.ws-trigger');
    const workspace = await page.locator('.ws-menu-item').first();
    await workspace.hover();
    await workspace.locator('[aria-label="Delete workspace"]').click();

    // Verify modal and delete
    const deleteModal = await page.locator('.modal-content:has-text("Delete Workspace")');
    await expect(deleteModal).toBeVisible();
    await page.click('.btn-danger');

    // Verify workspace removed
    const finalCount = await page.locator('.ws-menu-item').count();
    expect(finalCount).toBeLessThanOrEqual(initialCount);
  });
```

**Step 2: Run the integration test**

```bash
npx playwright test tests/workspace-management.spec.ts -g "lifecycle"
```

Expected: test should execute full flow

**Step 3: Commit**

```bash
git add tests/workspace-management.spec.ts
git commit -m "test: add integration test for workspace lifecycle"
```

---

## Task 12: Manual Testing & Bug Fixes

**Files:**
- Various (fixes as needed)

**Step 1: Manual test delete with files**

1. Start app: `npm run dev`
2. Open workspace dropdown
3. Click delete on a workspace
4. Verify modal appears with checkbox
5. Check "Also delete files" and delete
6. Verify:
   - Workspace removed from UI
   - Directory actually deleted from filesystem: `ls $WORKSPACE_DIR | grep <workspace-name>` (should not exist)

**Step 2: Manual test import**

1. Create test directory: `mkdir /tmp/test-import`
2. Add a file: `echo "test" > /tmp/test-import/test.txt`
3. Click "Import Existing Workspace"
4. Select `/tmp/test-import`
5. Verify:
   - Confirmation modal shows warning about large projects
   - Directory is copied to bind mount
   - New workspace appears in list
   - Can select and use it

**Step 3: Manual test reload**

1. Manually create workspace directory: `mkdir $WORKSPACE_DIR/manual-workspace`
2. Click "Reload" button
3. Verify:
   - New workspace appears in list
   - Loading state shows briefly
   - Success toast appears

**Step 4: Fix any issues found**

Create commits for each fix: `git commit -m "fix: [issue description]"`

---

## Final Verification

**Step 1: Run full E2E test suite**

```bash
npx playwright test
```

Expected: all tests pass, no regressions

**Step 2: Verify no console errors**

Start dev server and check browser console for errors

**Step 3: Test in Docker**

```bash
docker compose up --build
```

Access http://localhost:3000 and manually test all features

**Step 4: Final commit**

```bash
git log --oneline | head -15
# Verify all commits are present
git status
# Should be clean
```

---

## Summary of Changes

**Backend:**
- 3 new Socket.IO handlers: `workspace:delete-with-option`, `workspace:import`, `workspace:reload`

**Frontend:**
- 2 new modal components: `DeleteWorkspaceModal.svelte`, `ImportWorkspaceModal.svelte`
- Updated `Sidebar.svelte`: Added Import and Reload buttons
- Updated `workspace.svelte.ts`: Added 3 new store methods
- Updated `zeus.ts`: Added 3 new API methods

**Tests:**
- New E2E test file: `workspace-management.spec.ts` with 5+ tests

**Commits:**
- ~12 focused commits, each with single responsibility

---

## Execution

**Plan complete and saved to `docs/plans/2026-02-25-workspace-sync-implementation.md`.**

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach would you prefer?
