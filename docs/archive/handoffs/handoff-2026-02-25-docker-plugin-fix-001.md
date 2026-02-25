# Session Handoff: Docker Plugin Installation Fix

**Date:** 2026-02-25
**Branch:** main (unstaged changes)
**Epic:** EPIC-9 in Trekker

---

## What Was Done

1. **Reviewed unstaged changes** across 4 files (`Dockerfile`, `server/claude-config.js`, `src/renderer/src/lib/stores/plugin.svelte.ts`, `src/renderer/src/lib/components/MCPPanel.svelte`) that attempt to fix plugin installation failure inside Docker containers.

2. **Identified root cause:** The `claude-plugins-official` marketplace is not registered in the Docker image's `~/.claude.json`. In dev, the user's local config already has it. Additionally, `claude install` was running before PATH included `~/.local/bin`, so the native binary was unreachable for subsequent commands.

3. **Wrote implementation plan** at `docs/plans/plugin_patch_implementation_plan.md` with 6 tasks broken into atomic subtasks.

4. **Created Trekker tracking** — EPIC-9 with 6 tasks (TREK-17 through TREK-22) and 7 subtasks (TREK-23 through TREK-29), including dependencies.

---

## Current State of Changes

All changes are **unstaged** on the `main` branch. No commits have been made this session.

| File | Status | Summary |
|------|--------|---------|
| `Dockerfile` | Modified | mkdir .npm, chown fix, PATH before claude install, marketplace add |
| `server/claude-config.js` | Modified | console.error logging in runPluginCmd |
| `src/renderer/src/lib/stores/plugin.svelte.ts` | Modified | install() returns `{ success, error? }` instead of `boolean` |
| `src/renderer/src/lib/components/MCPPanel.svelte` | Modified | Toast shows `result.error` on failure |
| `entrypoint.sh` | **NOT YET MODIFIED** | Needs runtime marketplace registration (TREK-18) |

---

## What Remains

### Not yet implemented
- **TREK-18:** `entrypoint.sh` needs `claude plugin marketplace add claude-plugins-official 2>/dev/null || true` added after the `mkdir -p /home/coder/workspaces` line and before starting Zeus. This is a runtime safety net for volume mounts that overwrite `~/.claude.json`.

### Review feedback incorporated in plan but not in code
- The `|| true` in Dockerfile line 81 should be changed to `|| echo "[WARNING] marketplace registration failed — plugins may not install"` for build-time visibility. The current unstaged diff uses `|| true`.

### Verification not done
- **TREK-22:** Docker build + plugin install test has not been run. Must `docker compose up --build` and test plugin installation from the Zeus UI.

---

## Trekker State

```
EPIC-9: Fix Docker Plugin Installation (todo, P1)
  TREK-17: Fix Dockerfile PATH ordering + marketplace registration (todo, P1)
    TREK-23: Create .npm dir and fix chown (todo)
    TREK-24: Move ENV PATH block before claude install (todo)
    TREK-25: Add marketplace registration RUN step (todo)
  TREK-18: Add runtime marketplace registration to entrypoint.sh (todo, P2)
  TREK-19: Add error logging to runPluginCmd (todo, P2)
    TREK-26: Add console.error in close handler (todo)
    TREK-27: Add console.error in error handler (todo)
  TREK-20: Return error details from pluginStore.install() (todo, P2)
  TREK-21: Surface error messages in MCPPanel UI toasts (todo, P2, blocked by TREK-20)
    TREK-28: Update installOfficialPlugin toast (todo)
    TREK-29: Update installPluginByName toast (todo)
  TREK-22: Verify Docker plugin fix end-to-end (todo, P1, blocked by all above)
```

Dependencies: TREK-21 depends on TREK-20. TREK-22 depends on all tasks.

---

## Key Files

- **Plan:** `docs/plans/plugin_patch_implementation_plan.md`
- **Dockerfile:** `Dockerfile` (lines 58-82)
- **Plugin command runner:** `server/claude-config.js` (lines 171-201)
- **Plugin store:** `src/renderer/src/lib/stores/plugin.svelte.ts` (line 91)
- **UI panel:** `src/renderer/src/lib/components/MCPPanel.svelte` (lines 451-478)
- **Entrypoint:** `entrypoint.sh`
- **CLI path resolution:** `server/claude-cli.js` (lines 58-83, 157-171)

---

## Next Session Instructions

1. Run `trekker epic show EPIC-9` and `trekker task list --epic EPIC-9` to see current state
2. Read `docs/plans/plugin_patch_implementation_plan.md` for full implementation details
3. The unstaged changes for TREK-17, TREK-19, TREK-20, TREK-21 are already in place — review and validate them
4. Implement TREK-18 (entrypoint.sh change) — this is the only missing code change
5. Fix the `|| true` to `|| echo "[WARNING]..."` in Dockerfile line 81
6. Run `docker compose up --build` and verify plugin installation works (TREK-22)
7. Commit all changes together per the commit plan in the implementation plan
