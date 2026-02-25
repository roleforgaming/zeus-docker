# Workspace Sync & Deletion Design
**Date:** 2026-02-25
**Status:** Approved
**Author:** Claude Code

## Overview

This design addresses three interconnected issues:
1. **No confirmation before deletion** — users can accidentally remove workspaces
2. **Deletions not synced to filesystem** — workspace directories remain on bind mount
3. **No way to import existing projects** — users can't easily migrate projects into Zeus
4. **No ability to resync after external changes** — manually added/deleted projects don't reflect in UI

**Goal:** Implement full filesystem sync with explicit user control over deletion destructiveness and smooth import workflow.

---

## 1. Deletion with Confirmation Modal

### User Flow
1. User clicks delete icon on a workspace → **DeleteWorkspaceModal** appears
2. Modal displays:
   - Workspace name and path
   - Checkbox: "Also delete files from disk"
   - Warning text: "This action cannot be undone"
   - Buttons: "Cancel" | "Delete"
3. If unchecked: removes from Zeus list only (files remain on filesystem, can be re-imported)
4. If checked: deletes directory from filesystem AND removes from Zeus list
5. On confirm: backend processes deletion, updates UI

### Implementation Details

**Modal content:**
```
┌─────────────────────────────────────────────┐
│ Delete Workspace?                           │
├─────────────────────────────────────────────┤
│ Workspace: my-project                       │
│ Path: /home/coder/workspaces/my-project    │
│                                             │
│ ☐ Also delete files from disk              │
│                                             │
│ Warning: This action cannot be undone.     │
├─────────────────────────────────────────────┤
│                          [Cancel] [Delete]  │
└─────────────────────────────────────────────┘
```

**Error handling:**
- Deletion fails (permissions, locked files): show error toast, keep workspace in list
- Current workspace is being deleted: switch to next available workspace first
- Workspace doesn't exist on disk: still remove from Zeus list, show warning

**Backend handler:** `workspace:delete-with-option`
- Input: `{ wsPath: string, deleteFiles: boolean }`
- If `deleteFiles === true`: call `fs.rm(wsPath, { recursive: true, force: true })`
- Update workspace store, remove from list
- Return success/error response

---

## 2. Import Existing Workspace

### User Flow
1. User clicks "Import Existing Workspace" button in sidebar (below "Add Workspace")
2. **File picker dialog** opens (native directory picker)
3. User navigates to project directory and confirms
4. **ImportWorkspaceModal** appears showing:
   - Source path: `/Users/user/Desktop/my-react-app`
   - Destination: `/home/coder/workspaces/my-react-app`
   - Warning: "Large projects may take a minute or two to copy over"
   - Buttons: "Cancel" | "Import"
5. On confirm: backend copies directory to bind mount, adds to workspace list, selects it
6. Copy progress indicator while operation is in flight

### Implementation Details

**Modal content:**
```
┌─────────────────────────────────────────────┐
│ Import Existing Workspace                   │
├─────────────────────────────────────────────┤
│ Source:      /Users/user/Desktop/my-app    │
│ Destination: /home/coder/workspaces/my-app │
│                                             │
│ ⚠️  Large projects may take a minute or     │
│     two to copy over. Please be patient.   │
├─────────────────────────────────────────────┤
│                          [Cancel] [Import]  │
└─────────────────────────────────────────────┘
```

**Copy operation:**
- Use `fs.cp(source, dest, { recursive: true })`
- Handle name conflicts: append `-2`, `-3`, etc. if destination exists
- Show progress/loading state during copy
- Timeout if copy takes > 5 minutes (indicate to user)

**Error handling:**
- Source doesn't exist: show error "Directory not found"
- Insufficient disk space: show error with available space
- Copy fails mid-operation: rollback (delete partial copy), show error
- Workspace already exists in bind mount: skip copy, just add to list

**Backend handler:** `workspace:import`
- Input: `{ sourcePath: string }`
- Validate source exists and is directory
- Generate destination name (avoid conflicts)
- Copy recursively: `fs.cp(sourcePath, destPath, { recursive: true })`
- Add to workspace store
- Return new workspace object

---

## 3. Reload Workspaces Button

### User Flow
1. New "Reload" button in workspace dropdown menu (next to workspace list)
2. User clicks → button shows loading spinner
3. Backend scans bind mount directory
4. Compares filesystem state vs. current workspace list:
   - Directories on disk but not in list → **add them**
   - Directories in list but not on disk → **remove them**
5. UI updates with new list
6. If current workspace was deleted: auto-switch to first available
7. Success toast: "Workspace list updated" (or show count of changes)

### Implementation Details

**Reload flow:**
```
User clicks reload
    ↓
Backend scans /home/coder/workspaces
    ↓
Compare with current workspace list
    ↓
New dirs on disk? → Add to list
Dirs in list but missing? → Remove from list
    ↓
Current workspace deleted? → Switch to first available
    ↓
Update UI, show success message
```

**Error handling:**
- Bind mount unavailable (permission denied): show error, don't update
- Scan fails for other reasons: show error, list stays unchanged
- Current workspace deleted externally: auto-switch silently

**Backend handler:** `workspace:reload`
- Input: none
- Scan bind mount: `fs.readdirSync(workspacePath)`
- For each directory: create `Workspace` object (path, name, timestamps)
- Compare with current list
- Merge: keep existing, add new, remove missing
- Return updated list

---

## 4. Backend Architecture

### New Socket.IO Handlers

**`workspace:delete-with-option`**
```javascript
socket.on('workspace:delete-with-option', async ({ wsPath, deleteFiles }, callback) => {
  try {
    if (deleteFiles) {
      await fs.rm(wsPath, { recursive: true, force: true });
    }
    // Remove from store
    const store = getStore();
    store.workspaces = store.workspaces.filter(w => w.path !== wsPath);
    saveStore(store);

    callback({ success: true, message: 'Workspace deleted' });
  } catch (error) {
    callback({ success: false, error: error.message });
  }
});
```

**`workspace:import`**
```javascript
socket.on('workspace:import', async (sourcePath, callback) => {
  try {
    // Validate source
    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) throw new Error('Source must be a directory');

    // Generate destination name
    const baseName = path.basename(sourcePath);
    let destPath = path.join(WORKSPACE_DIR, baseName);
    let counter = 2;
    while (fs.existsSync(destPath)) {
      destPath = path.join(WORKSPACE_DIR, `${baseName}-${counter}`);
      counter++;
    }

    // Copy
    await fs.cp(sourcePath, destPath, { recursive: true });

    // Add to store
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

**`workspace:reload`**
```javascript
socket.on('workspace:reload', async (callback) => {
  try {
    const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
    const diskWorkspaces = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        path: path.join(WORKSPACE_DIR, e.name),
        name: e.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

    const store = getStore();
    store.workspaces = diskWorkspaces; // Replace with disk state
    saveStore(store);

    callback({ success: true, workspaces: diskWorkspaces });
  } catch (error) {
    callback({ success: false, error: error.message });
  }
});
```

### Frontend Changes

**New components:**
- `DeleteWorkspaceModal.svelte` — confirmation with checkbox
- `ImportWorkspaceModal.svelte` — file picker + warning
- Update `Sidebar.svelte` — add Import + Reload buttons
- Update `workspace.svelte.ts` store — add methods for new operations

**Store methods:**
```typescript
async deleteWithOption(wsPath: string, deleteFiles: boolean) {
  await window.zeus.workspace.deleteWithOption(wsPath, deleteFiles);
  await this.load(); // Reload list
}

async importWorkspace(sourcePath: string) {
  const result = await window.zeus.workspace.import(sourcePath);
  await this.load();
  return result;
}

async reload() {
  await window.zeus.workspace.reload();
  await this.load();
}
```

---

## 5. Testing Strategy

**Unit tests (backend):**
- Deletion with/without files: verify directory removed or kept
- Import: verify directory copied, added to list
- Reload: verify list synced with filesystem
- Error cases: invalid paths, permission denied, disk full

**E2E tests (Playwright):**
- Delete workspace → confirm modal appears
- Check/uncheck delete files checkbox
- Import workspace from picker
- Click reload → new workspaces appear

---

## 6. Success Criteria

- ✅ User sees confirmation modal before any deletion
- ✅ User controls whether files are deleted or just removed from list
- ✅ User can import existing projects from external locations
- ✅ User can reload workspace list to see external changes
- ✅ All operations have proper error handling and user feedback
- ✅ No data loss unless explicitly confirmed by user

---

## Timeline & Dependencies

This feature is self-contained. No dependencies on other systems.

**Estimated phases:**
1. Backend handlers (`workspace:delete-with-option`, `workspace:import`, `workspace:reload`)
2. Frontend modals and button integration
3. E2E tests
4. Edge case handling and refinement
