# Design: Runtime CODE_SERVER_URL Configuration

**Date:** 2026-02-23
**Status:** Approved

## Problem

`IDEModal.svelte` has a hardcoded personal domain (`intothesavvyverse.us`) baked into the statically-built frontend. Self-hosters cannot change the code-server URL without modifying source and rebuilding the image.

## Constraints

- The Svelte frontend is built at **image build time** (Stage 1 of the unified Dockerfile). `VITE_` build-time env vars would require a rebuild per deployment — unacceptable for distribution.
- The backend (`server/open-local-ide.js`) already reads `CODE_SERVER_URL` from the environment with a `localhost:8081` default. This pattern is the right model.
- `docker-compose.yml` already passes env vars to the container at runtime.

## Approach: Runtime `/config` Endpoint

The Express server exposes a tiny `GET /config` JSON endpoint. The frontend fetches it once on mount and stores the `codeServerUrl` value. `IDEModal` reads from this store rather than computing a URL itself.

### Why not VITE_ build-time vars?

Requires `docker build --build-arg` per environment. Defeats the purpose of distributable images.

### Why not same-origin path prefix?

Requires nginx/reverse-proxy inside the container and fragile `--root-path` code-server config. More moving parts, harder to self-host.

## Architecture

```
docker-compose.yml
  └─ CODE_SERVER_URL=https://code.yourdomain.com  (env var)
       │
       ▼
  server/index.js
  └─ GET /config → { codeServerUrl: "https://code.yourdomain.com" }
       │
       ▼
  src/renderer/src/lib/stores/ui.svelte.ts
  └─ fetch('/config') on app init → codeServerUrl state
       │
       ▼
  IDEModal.svelte
  └─ reads uiStore.codeServerUrl (no hostname check, no hardcoded domain)
```

## Changes

### 1. `server/index.js` — add `/config` endpoint

```js
app.get('/config', (_req, res) => {
  res.json({
    codeServerUrl: process.env.CODE_SERVER_URL || 'http://localhost:8081'
  })
})
```

### 2. `src/renderer/src/lib/stores/ui.svelte.ts` — fetch config on init

Add `codeServerUrl = $state('http://localhost:8081')` and a `loadConfig()` method that fetches `/config` and sets the value.

### 3. `src/renderer/src/App.svelte` — call `uiStore.loadConfig()` on mount

One call alongside the existing `workspace.load()` and other init calls.

### 4. `src/renderer/src/lib/components/IDEModal.svelte` — remove hardcoded logic

Replace the `window.location.hostname.includes(...)` block with `uiStore.codeServerUrl`.

### 5. `server/ide.js` — align localhost default

`server/ide.js:109` has its own hardcoded `http://localhost:8081`. Update it to read `process.env.CODE_SERVER_URL || 'http://localhost:8081'` for consistency.

### 6. `docker-compose.yml` — document the env var

Add `CODE_SERVER_URL` with a comment explaining its purpose. Default to blank (falling back to `localhost:8081`) so existing users aren't broken.

### 7. `.env.example` — create file with documented variables

### 8. `README.md` — add env var to deployment section

## Defaults & Fallbacks

| Scenario | Result |
|---|---|
| `CODE_SERVER_URL` not set | Falls back to `http://localhost:8081` at every layer |
| Local dev (`npm run dev`) | `/config` returns `http://localhost:8081` |
| Docker with `CODE_SERVER_URL=https://code.domain.com` | Frontend and backend both use that URL |

## Out of Scope

- `playwright.config.ts` and `tests/helpers/app.ts` `localhost:3000` — these are dev/test only, not self-hosting concerns.
- `vite.config.ts` proxy target — dev only.

## Success Criteria

- No reference to `intothesavvyverse.us` anywhere in the codebase.
- `docker-compose.yml` has `CODE_SERVER_URL` documented with a comment.
- `.env.example` exists with `CODE_SERVER_URL`.
- Omitting `CODE_SERVER_URL` falls back to `http://localhost:8081` gracefully.
- The frontend reads URL from store (fetched from `/config`), not from `window.location.hostname`.
