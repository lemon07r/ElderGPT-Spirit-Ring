---
title: AFNM Modding Reference
status: active
authoritative: false
owner: eldergpt-maintainers
last_verified: 2026-04-04
source_of_truth: live AFNM 0.6.50 runtime + official AFNM docs site + AfnmExampleMod repo
review_cycle_days: 45
related_files: scripts/installed-game-runtime.js,docs/project/MODAPI_0_6_49_AUDIT.md,AGENTS.md
---

# AFNM Modding Reference

This file is a practical reference for future ElderGPT work. It is not the primary source of truth for our implementation details; those live in `docs/project/*`.

## Upstream Sources Worth Checking First

- Docs site: `https://lyeeedar.github.io/AfnmExampleMod/`
- Example repo: `https://github.com/Lyeeedar/AfnmExampleMod`
- Local installed runtime oracle: `bun run runtime:oracle`

When AFNM changes, prefer those sources before reviving old reverse-engineering assumptions.

## Current Fallback Ladder

As of AFNM `0.6.50`, use this order:

1. `window.modAPI.getGameStateSnapshot()`
2. `window.modAPI.subscribe()`
3. `window.modAPI.injectUI()` or `addScreen()` for official UI integration
4. `window.gameStore` read-only access
5. React Fiber / DOM scraping only for confirmed gaps

## `window.gameStore`

`window.gameStore` is still useful as a fallback and for debugging:

```ts
const state = window.gameStore?.getState();
const player = state?.player?.player;
const location = state?.location?.current;
```

Treat it as read-only. Do not mutate the store directly.

## React Fiber / DOM Scraping

Fiber or DOM scraping is no longer the default plan, but it remains the final escape hatch if:

- the live modAPI does not expose the data
- the docs site does not document a safe hook/API
- the mod genuinely needs the missing signal

If used, keep it inside a tiny adapter with `try/catch` boundaries and document the exact reason it still exists.

## Monkey-Patching

This should now be extremely rare. Several lifecycle and interception points that used to require patching now have official hooks. Only consider patching when the live runtime and official docs both confirm a missing capability.
