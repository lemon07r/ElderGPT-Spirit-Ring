---
title: ModAPI 0.6.49–0.6.50 Audit
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-06
source_of_truth: live AFNM 0.6.50 runtime + afnm-types 0.6.50 + official upstream docs
review_cycle_days: 21
related_files: package.json,scripts/installed-game-runtime.js,src/integration/gameState.ts,src/integration/proactive.ts,src/integration/uiBridge.tsx,docs/reference/AFNM_MODDING.md
---

# ModAPI 0.6.49–0.6.50 Audit

This document records what changed upstream and how ElderGPT should respond.

## Confirmed In The Live Installed Runtime

The installed AFNM `0.6.49-727424c` runtime now exposes these capabilities:

- `injectUI`
- `subscribe`
- `getGameStateSnapshot`
- `onEventDropItem`
- `onGenerateExploreEvents`
- `onCalculateDamage`
- `onLocationEnter`
- `onLootDrop`
- `onAdvanceDay`
- `onAdvanceMonth`
- `onBeforeCombat`
- `onReduxAction`

The runtime oracle in `scripts/installed-game-runtime.js` now detects all of the above directly from the installed bundle.

## afnm-types Changes Relevant To ElderGPT

From `0.6.47` to `0.6.49`, the type package now includes:

- root-level `injectUI(slotName, generator)`
- root-level `subscribe(listener)`
- root-level `getGameStateSnapshot()`
- the new hook signatures listed above
- `GAME_VERSION = "0.6.50"`
- extra recipe completion fields in `reduxState.d.ts`
- updated UI component props in `components.d.ts`
- additional stat/item/event surface changes that are not currently critical to ElderGPT

## Adopted Now

These are implemented in the repo today:

1. `afnm-types` upgraded to `0.6.50`
2. context reads now prefer `getGameStateSnapshot()`
3. reactive UI state now prefers `subscribe()`
4. a `combat-victory` entry point now uses `injectUI()`
5. proactive suggestions now use `onLocationEnter`, `onAdvanceMonth`, long-skip `onAdvanceDay`, `onCompleteCombat`, `onCompleteCrafting`, `onLootDrop`, and `onBeforeCombat` (read-only)
6. the runtime oracle documents and verifies the new live API surface
7. context extraction now includes `persistentEventLog` entries and `craftingTeamUpOverride` companion name
8. CSP workaround removed — AFNM 0.6.50 no longer sets a restrictive `connect-src` CSP, so `fetch()` works directly

## Replace Immediately

These old patterns should now be considered second-class:

- primary reads from `window.gameStore`
- “modAPI is too limited” as a baseline assumption
- default plans that jump straight to Fiber or DOM scraping
- monkey-patching to discover drops or lifecycle events that now have official hooks

## Adopted With Caution

- `onLocationEnter`
  Now used for proactive location advice.

- `onAdvanceDay` and `onAdvanceMonth`
  Now used conservatively for major time changes, with rate limiting to avoid chatter.

- `onCompleteCombat` and `onCompleteCrafting`
  Now used for short post-combat and post-crafting guidance.

## Good Future Fits For This Mod

- `onGenerateExploreEvents`
  Useful if the mod ever wants to explain available exploration pressure, but only if the feature becomes more than advisory.

## Avoid By Default

- `onReduxAction`
  Powerful but reducer-time. Use only when a concrete gap cannot be solved with snapshots and subscriptions.

- `onCalculateDamage`, `onEventDropItem`
  These mutate gameplay outcomes and do not fit the default read-only advisor contract.

Note: `onBeforeCombat` moved to adopted — the mod now uses it as a read-only advisor hook (returns inputs unchanged). `onLootDrop` is adopted for post-loot item guidance.
