# Docker Plugin Installation Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix plugin installation inside the Docker container. Plugins work in dev but fail in production Docker builds with: `Plugin "github" not found in marketplace "claude-plugins-official"`.

**Root Cause:** Two issues: (1) the `claude-plugins-official` marketplace is not registered inside the Docker image, and (2) `claude install` ran before `PATH` included `~/.local/bin`, so the native binary wasn't reachable. Additionally, error messages were swallowed, making debugging impossible.

**Tech Stack:** Dockerfile, Node.js (server), Svelte 5 (frontend), no new dependencies.

---

## Task 1: Fix Dockerfile PATH ordering and marketplace registration

**Files:**
- Modify: `Dockerfile`

### Step 1.1: Create `.npm` directory and fix ownership

In the `Dockerfile`, find this block (around line 60-63):

```dockerfile
# Fix ownership and permissions for coder user
RUN chown -R coder:coder /home/coder/zeus /entrypoint.sh && \
    chmod +x /entrypoint.sh
```

Replace it with:

```dockerfile
# Fix ownership and permissions for coder user
RUN mkdir -p /home/coder/.npm && \
    chown -R coder:coder /home/coder/zeus /entrypoint.sh /home/coder/.npm && \
    chmod +x /entrypoint.sh
```

**Why:** Without this, npm operations as the `coder` user fail with EACCES because `/home/coder/.npm` doesn't exist or is owned by root.

### Step 1.2: Move ENV PATH before `claude install`

Find these lines (around line 68-77):

```dockerfile
ENV NPM_CONFIG_PREFIX=/home/coder/.npm-global
RUN mkdir -p /home/coder/.npm-global

# Update Claude to native installer as the coder user
RUN claude install

# Set environment variables
ENV PORT=3000 \
    NODE_ENV=production \
    PATH="/home/coder/.npm-global/bin:/home/coder/.local/bin:${PATH}"
```

Replace with:

```dockerfile
ENV NPM_CONFIG_PREFIX=/home/coder/.npm-global
RUN mkdir -p /home/coder/.npm-global

# Set PATH before running claude commands so the native binary is reachable
ENV PORT=3000 \
    NODE_ENV=production \
    PATH="/home/coder/.npm-global/bin:/home/coder/.local/bin:${PATH}"

# Update Claude to native installer as the coder user
RUN claude install
```

**Why:** `claude install` places the native binary in `~/.local/bin`. Subsequent `RUN` commands need that directory in PATH. Previously, PATH was set *after* `claude install`, so the next step couldn't find the native `claude` binary.

### Step 1.3: Register the official plugin marketplace

Immediately after `RUN claude install`, add:

```dockerfile
# Register the official plugin marketplace so installs work out of the box
RUN claude plugin marketplace add https://github.com/anthropic/plugins-official.git \
    || echo "[WARNING] marketplace registration failed — plugins may not install"
```

**Why:** In dev, the user's `~/.claude.json` already has the marketplace registered. The Docker image starts fresh with no marketplaces. This pre-registers it at build time.

### Step 1.4: Verify — review the full Dockerfile bottom section

After all changes, the section from `USER coder` to `EXPOSE` should read:

```dockerfile
USER coder

ENV NPM_CONFIG_PREFIX=/home/coder/.npm-global
RUN mkdir -p /home/coder/.npm-global

ENV PORT=3000 \
    NODE_ENV=production \
    PATH="/home/coder/.npm-global/bin:/home/coder/.local/bin:${PATH}"

RUN claude install

RUN claude plugin marketplace add https://github.com/anthropic/plugins-official.git \
    || echo "[WARNING] marketplace registration failed — plugins may not install"

EXPOSE 3000 8080
```

---

## Task 2: Add runtime marketplace registration to entrypoint

**Files:**
- Modify: `entrypoint.sh`

### Step 2.1: Add marketplace registration as a runtime safety net

In `entrypoint.sh`, after the `mkdir -p /home/coder/workspaces` line (line 7) and before starting Zeus (line 14), add:

```bash
# Ensure the official plugin marketplace is registered (safety net for volume mounts
# that may overwrite ~/.claude.json from the build-time registration)
claude plugin marketplace add https://github.com/anthropic/plugins-official.git 2>/dev/null || true
```

**Why:** If the user mounts a volume over `/home/coder` or deletes `~/.claude.json`, the build-time marketplace registration is lost. This re-registers it every time the container starts.

---

## Task 3: Add error logging to `runPluginCmd`

**Files:**
- Modify: `server/claude-config.js`

### Step 3.1: Add `console.error` logging on plugin command failure

In `server/claude-config.js`, find the `runPluginCmd` function (around line 171). Locate the `child.on('close', ...)` handler:

```javascript
child.on('close', (code) => {
  if (code === 0) resolve({ success: true, output: stdout })
  else resolve({ success: false, error: stderr || stdout || `Exit code ${code}` })
})
```

Replace with:

```javascript
child.on('close', (code) => {
  if (code === 0) resolve({ success: true, output: stdout })
  else {
    const error = stderr || stdout || `Exit code ${code}`
    console.error(`[zeus] plugin command failed (${args.join(' ')}):`, error)
    resolve({ success: false, error })
  }
})
```

### Step 3.2: Add `console.error` logging on spawn error

In the same function, find:

```javascript
child.on('error', (err) => resolve({ success: false, error: err.message }))
```

Replace with:

```javascript
child.on('error', (err) => {
  console.error(`[zeus] plugin command error (${args.join(' ')}):`, err.message)
  resolve({ success: false, error: err.message })
})
```

**Why:** Without logging, plugin failures in Docker are invisible in container logs. This makes it possible to diagnose issues via `docker logs`.

---

## Task 4: Return error details from `pluginStore.install()`

**Files:**
- Modify: `src/renderer/src/lib/stores/plugin.svelte.ts`

### Step 4.1: Change `install()` return type from `boolean` to `{ success, error? }`

In `src/renderer/src/lib/stores/plugin.svelte.ts`, find the `install` method (around line 91):

```typescript
async install(name: string, scope: string = 'user'): Promise<boolean> {
  const result = await window.zeus.plugin.install(name, scope)
  if (result.success) {
    await this.load()
  }
  return result.success
}
```

Replace with:

```typescript
async install(name: string, scope: string = 'user'): Promise<{ success: boolean; error?: string }> {
  const result = await window.zeus.plugin.install(name, scope)
  if (result.success) {
    await this.load()
  }
  return result
}
```

**Why:** The backend already returns `{ success, error }` but the store was discarding the error field. The UI needs it to show meaningful error messages.

---

## Task 5: Surface error messages in MCPPanel UI

**Files:**
- Modify: `src/renderer/src/lib/components/MCPPanel.svelte`

### Step 5.1: Update `installOfficialPlugin` to use error from result

In `MCPPanel.svelte`, find `installOfficialPlugin` (around line 451):

```typescript
const ok = await pluginStore.install(fullName, "user");
if (ok) uiStore.showToast(`Installed: ${id}`, "success");
else uiStore.showToast(`Failed to install: ${id}`, "error");
```

Replace with:

```typescript
const result = await pluginStore.install(fullName, "user");
if (result.success) uiStore.showToast(`Installed: ${id}`, "success");
else uiStore.showToast(`Failed to install: ${id}: ${result.error ?? 'unknown error'}`, "error");
```

### Step 5.2: Update `installPluginByName` to use error from result

In the same file, find `installPluginByName` (around line 462):

```typescript
const ok = await pluginStore.install(
  pluginInstallName.trim(),
  pluginInstallScope,
);
if (ok) {
  uiStore.showToast(`Installed: ${pluginInstallName.trim()}`, "success");
  pluginInstallName = "";
} else {
  uiStore.showToast(
    `Failed to install: ${pluginInstallName.trim()}`,
    "error",
  );
}
```

Replace with:

```typescript
const result = await pluginStore.install(
  pluginInstallName.trim(),
  pluginInstallScope,
);
if (result.success) {
  uiStore.showToast(`Installed: ${pluginInstallName.trim()}`, "success");
  pluginInstallName = "";
} else {
  uiStore.showToast(
    `Failed to install: ${pluginInstallName.trim()}: ${result.error ?? 'unknown error'}`,
    "error",
  );
}
```

**Why:** Previously the toast just said "Failed to install: github" with no reason. Now it shows the actual CLI error, e.g., `Plugin "github" not found in marketplace "claude-plugins-official"`.

---

## Task 6: Verify the fix

### Step 6.1: Build the Docker image

```bash
docker compose up --build
```

Confirm no errors during:
- `RUN claude install`
- `RUN claude plugin marketplace add https://github.com/anthropic/plugins-official.git`

### Step 6.2: Test plugin installation inside the container

Open Zeus at `http://localhost:3000`, navigate to the MCP/Plugins panel, and install the `github` plugin. It should succeed.

### Step 6.3: Test error display

Try installing a non-existent plugin name. The toast should show a descriptive error message instead of just "Failed to install".

### Step 6.4: Check container logs

```bash
docker logs <container-name> 2>&1 | grep "\[zeus\] plugin"
```

Confirm that failed plugin commands produce `[zeus] plugin command failed (...)` log entries.

---

## Commit Plan

After all tasks pass verification:

```bash
git add Dockerfile entrypoint.sh server/claude-config.js \
  src/renderer/src/lib/stores/plugin.svelte.ts \
  src/renderer/src/lib/components/MCPPanel.svelte

git commit -m "fix: resolve plugin installation failure in Docker container

- Register claude-plugins-official marketplace at build time and runtime
- Fix PATH ordering so claude install native binary is reachable
- Create .npm directory with correct ownership to prevent EACCES
- Surface plugin install error messages in UI toast notifications
- Add server-side logging for plugin command failures"
```
