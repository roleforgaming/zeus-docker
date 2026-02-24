# CODE_SERVER_URL Runtime Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded `intothesavvyverse.us` domain in `IDEModal.svelte` with a runtime-configurable `CODE_SERVER_URL` env var, delivered to the static frontend via a `GET /config` Express endpoint.

**Architecture:** The Express server reads `CODE_SERVER_URL` from the environment and exposes it at `GET /config`. On app mount, `uiStore.loadConfig()` fetches this endpoint once and stores the URL. `IDEModal` reads `uiStore.codeServerUrl` instead of computing it from `window.location.hostname`.

**Tech Stack:** Node.js/Express, Svelte 5 runes, Docker Compose, no new dependencies.

---

## Task 1: Add `GET /config` endpoint to Express server

**Files:**
- Modify: `server/index.js:89-99` (after the static file block, before the debug endpoint)

**Step 1: Add the endpoint**

In `server/index.js`, insert after line 99 (after the `app.get("*", ...)` catch-all — **before** it, actually, since Express routes are first-match):

```js
// ── Runtime Config ─────────────────────────────────────────────────────────────

// Exposes server-side environment variables to the statically-built frontend.
// Self-hosters set CODE_SERVER_URL in docker-compose.yml to configure their domain.
app.get("/config", (_req, res) => {
  res.json({
    codeServerUrl: process.env.CODE_SERVER_URL || "http://localhost:8081",
  });
});
```

**IMPORTANT:** This must be placed **before** the `app.get("*", ...)` catch-all SPA fallback (currently line 94), otherwise the catch-all will intercept `/config` and serve `index.html`. Insert it right before the static file block or directly before the `app.get("*", ...)` line.

**Step 2: Manually verify the endpoint works**

```bash
# Restart the server (if running)
# Then:
curl http://localhost:3000/config
```

Expected output:
```json
{"codeServerUrl":"http://localhost:8081"}
```

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add GET /config endpoint for runtime env exposure"
```

---

## Task 2: Add `codeServerUrl` state and `loadConfig()` to `UIStore`

**Files:**
- Modify: `src/renderer/src/lib/stores/ui.svelte.ts`

**Step 1: Add the state field and method to `UIStore`**

In the `UIStore` class (starts at line 87), add after the existing state fields (e.g., after line 95 `toasts = $state<Toast[]>([])`):

```ts
/** code-server base URL — loaded from /config on app init */
codeServerUrl = $state('http://localhost:8081')

/** Fetch runtime config from the Express server */
async loadConfig(): Promise<void> {
  try {
    const res = await fetch('/config')
    if (!res.ok) return
    const data: { codeServerUrl?: string } = await res.json()
    if (data.codeServerUrl) {
      this.codeServerUrl = data.codeServerUrl
    }
  } catch {
    // Keep default — server unreachable (e.g., pure dev without backend)
  }
}
```

**Step 2: Verify TypeScript compiles cleanly**

```bash
cd /home/savvydev/projects/zeus
npx svelte-check --tsconfig ./tsconfig.web.json 2>&1 | grep -E "Error|error" | head -20
```

Expected: no errors related to `codeServerUrl` or `loadConfig`.

**Step 3: Commit**

```bash
git add src/renderer/src/lib/stores/ui.svelte.ts
git commit -m "feat: add codeServerUrl state and loadConfig() to UIStore"
```

---

## Task 3: Call `uiStore.loadConfig()` in `App.svelte` on mount

**Files:**
- Modify: `src/renderer/src/App.svelte:40-45`

**Step 1: Add `loadConfig()` to the `Promise.all` init block**

The current block at line 40–45 is:
```ts
await Promise.all([
  workspaceStore.load(),
  claudeStore.check(),
  ideStore.load(),
  uiStore.syncModelFromSettings()
])
```

Change it to:
```ts
await Promise.all([
  workspaceStore.load(),
  claudeStore.check(),
  ideStore.load(),
  uiStore.syncModelFromSettings(),
  uiStore.loadConfig()
])
```

**Step 2: Verify TypeScript compiles cleanly**

```bash
npx svelte-check --tsconfig ./tsconfig.web.json 2>&1 | grep -E "Error|error" | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/renderer/src/App.svelte
git commit -m "feat: call uiStore.loadConfig() on app mount"
```

---

## Task 4: Refactor `IDEModal.svelte` to use `uiStore.codeServerUrl`

**Files:**
- Modify: `src/renderer/src/lib/components/IDEModal.svelte`

**Step 1: Replace hardcoded hostname logic**

The current script block (lines 1–33) has:
```ts
const codeServerBase = window.location.hostname.includes('intothesavvyverse.us')
  ? 'https://code.intothesavvyverse.us'
  : 'http://localhost:8081'
```

Replace the entire `<script>` block with:
```ts
<script lang="ts">
  import { workspaceStore } from '../stores/workspace.svelte.js'
  import { uiStore } from '../stores/ui.svelte.js'

  function openCodeServer() {
    if (!workspaceStore.active) {
      uiStore.showToast('No active workspace selected', 'error')
      return
    }

    const wsPath = workspaceStore.active.path
    const targetUrl = `${uiStore.codeServerUrl}/?folder=${encodeURIComponent(wsPath)}`

    try {
      window.open(targetUrl, '_blank')
      uiStore.showToast('Opening workspace in code-server...', 'info')
    } catch (err) {
      uiStore.showToast(
        `Failed to open: ${err instanceof Error ? err.message : String(err)}`,
        'error'
      )
    } finally {
      uiStore.ideModalOpen = false
    }
  }
</script>
```

Also update the info text in the template (line 50) from:
```svelte
Opening <code>{codeServerBase}</code>
```
to:
```svelte
Opening <code>{uiStore.codeServerUrl}</code>
```

**Step 2: Verify TypeScript/Svelte compiles cleanly**

```bash
npx svelte-check --tsconfig ./tsconfig.web.json 2>&1 | grep -E "Error|error" | head -20
```

Expected: no errors.

**Step 3: Audit — confirm no hardcoded domain remains**

```bash
grep -r "intothesavvyverse" /home/savvydev/projects/zeus --include="*.ts" --include="*.svelte" --include="*.js"
```

Expected: zero results.

**Step 4: Commit**

```bash
git add src/renderer/src/lib/components/IDEModal.svelte
git commit -m "fix: replace hardcoded domain in IDEModal with uiStore.codeServerUrl"
```

---

## Task 5: Fix `server/ide.js` hardcoded URL

**Files:**
- Modify: `server/ide.js:107-111`

**Step 1: Replace hardcoded base URL**

Current code at line 109:
```js
const baseUrl = "http://localhost:8081";
```

Replace with:
```js
const baseUrl = process.env.CODE_SERVER_URL || "http://localhost:8081";
```

**Step 2: Commit**

```bash
git add server/ide.js
git commit -m "fix: read CODE_SERVER_URL env var in server/ide.js"
```

---

## Task 6: Update `docker-compose.yml` with documented env var

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add `CODE_SERVER_URL` to the environment block**

Current `environment` block:
```yaml
environment:
  - NODE_ENV=production
  - ZEUS_PORT=3000
  - PASSWORD=savvydev
  - HOST_AGENT_URL=http://host.docker.internal:3001
  - CODESERVER_PORT=8080
```

Replace with:
```yaml
environment:
  - NODE_ENV=production
  - ZEUS_PORT=3000
  - PASSWORD=savvydev
  - HOST_AGENT_URL=http://host.docker.internal:3001
  - CODESERVER_PORT=8080
  # URL where code-server IDE is publicly accessible.
  # Set this to your domain if using a reverse proxy or tunnel
  # (e.g., https://code.yourdomain.com). Defaults to http://localhost:8081.
  - CODE_SERVER_URL=${CODE_SERVER_URL:-http://localhost:8081}
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add CODE_SERVER_URL env var to docker-compose.yml"
```

---

## Task 7: Create `.env.example`

**Files:**
- Create: `.env.example`

**Step 1: Create the file**

```bash
cat > /home/savvydev/projects/zeus/.env.example << 'EOF'
# Zeus Environment Configuration
# Copy this file to .env and customize for your deployment.

# URL where code-server (browser IDE) is publicly accessible.
# For local Docker deployments, the default (http://localhost:8081) works out of the box.
# For reverse proxy / tunnel deployments, set this to your public code-server URL.
# Example: CODE_SERVER_URL=https://code.yourdomain.com
CODE_SERVER_URL=http://localhost:8081

# code-server password (used by the container to set access credentials)
PASSWORD=changeme
EOF
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example with CODE_SERVER_URL documentation"
```

---

## Task 8: Update `README.md` deployment section

**Files:**
- Modify: `README.md` — the "Docker Deployment" section (around line 55–70)

**Step 1: Add env var table**

After the existing "Configuration:" bullet list (around line 66–70), add:

```markdown
**Environment Variables:**

| Variable | Default | Description |
|---|---|---|
| `CODE_SERVER_URL` | `http://localhost:8081` | Public URL for code-server IDE. Set to your domain when using a reverse proxy or Cloudflare tunnel (e.g., `https://code.yourdomain.com`). |
| `PASSWORD` | *(required)* | Password to access code-server IDE. |
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document CODE_SERVER_URL env var in README deployment section"
```

---

## Task 9: Final verification

**Step 1: Full audit — confirm no hardcoded domain**

```bash
grep -r "intothesavvyverse" /home/savvydev/projects/zeus \
  --include="*.ts" --include="*.svelte" --include="*.js" --include="*.yml" --include="*.md"
```

Expected: zero results.

**Step 2: Build the frontend**

```bash
cd /home/savvydev/projects/zeus && npm run build 2>&1 | tail -10
```

Expected: build completes without errors.

**Step 3: Smoke test the config endpoint**

```bash
# If server is running:
curl http://localhost:3000/config
```

Expected: `{"codeServerUrl":"http://localhost:8081"}`

**Step 4: Test with env var override**

```bash
CODE_SERVER_URL=https://code.example.com node server/index.js &
sleep 1
curl http://localhost:3000/config
kill %1
```

Expected: `{"codeServerUrl":"https://code.example.com"}`
