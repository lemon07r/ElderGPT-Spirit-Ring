---
title: ModAPI Audit
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-27
source_of_truth: live AFNM 0.6.52 runtime + afnm-types 0.6.52-v2 + official upstream docs
review_cycle_days: 21
related_files: package.json,scripts/installed-game-runtime.js,src/integration/gameState.ts,src/integration/proactive.ts,src/integration/uiBridge.tsx,docs/reference/AFNM_MODDING.md
---

# ModAPI Audit

This document records what changed upstream and how ElderGPT should respond.

## Confirmed In The Live Installed Runtime

The installed AFNM `0.6.52` runtime exposes these capabilities:

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

The runtime oracle in `scripts/installed-game-runtime.js` detects all of the above directly from the installed bundle.

## afnm-types 0.6.52-v2 Changes Relevant To ElderGPT

### New since 0.6.50

- `modAPI.utils.getTechniqueSlots(realm)` — returns the number of technique slots per stance for a given realm. Used in `contextEngine.ts` for the `maxTechniqueSlots` context field.
- `modAPI.utils.t(value)`, `tPlural(count, one, other)`, `tr(key)` — translation functions for `Translatable` objects. Used in `contextEngine.ts` for proper display name resolution.
- `modAPI.hooks.onReduxActionPayload(interceptor)` — pre-reducer payload interceptor. Returns modified payload or `null` to drop. Not adopted (read-only mod).
- `modAPI.utils.makeSave/loadSave/listSaves` — save management functions. Not adopted (out of scope).
- `modAPI.actions.addToSectShop` — add items to the sect shop. Not adopted (content mod feature).
- `gameData.monsters: EnemyEntity[]` — global monster registry.
- `gameData.puppets: PuppetType[]` — training ground puppet types.
- `gameData.alternativeStarts: AlternativeStart[]` — alternative game starts.
- `gameData.tutorials` — tutorial system data.
- New Redux state slices: `soulShardDelve`, `expedition`, `characterUiPreferences`.
- Combat: `playerStyleStances`, `playerStyleCycles`, `ConditionalCycle` — enemies can now use player-style stance selection.
- `Scaling.divideByStanceLength` — scaling values can be divided by stance length.
- `Translatable` type now includes `TranslatablePlural` for pluralization.

### From 0.6.47 to 0.6.50 (prior audit)

- `injectUI(slotName, generator)`, `subscribe(listener)`, `getGameStateSnapshot()`
- Lifecycle hooks: `onLocationEnter`, `onAdvanceDay`, `onAdvanceMonth`, `onLootDrop`, `onBeforeCombat`, `onReduxAction`
- `GAME_VERSION = "0.6.50"` (now `"0.6.52"`)
- Extra recipe completion fields, updated UI component props

## Adopted Now

These are implemented in the repo today:

1. `afnm-types` upgraded to `0.6.52-v2`
2. Context reads prefer `getGameStateSnapshot()`
3. Reactive UI state prefers `subscribe()`
4. A `combat-victory` entry point uses `injectUI()`
5. Proactive suggestions use `onLocationEnter`, `onAdvanceMonth`, long-skip `onAdvanceDay`, `onCompleteCombat`, `onCompleteCrafting`, `onLootDrop`, and `onBeforeCombat` (read-only)
6. The runtime oracle documents and verifies the live API surface
7. Context extraction includes `persistentEventLog` entries and `craftingTeamUpOverride` companion name
8. CSP workaround removed — AFNM 0.6.50+ no longer sets a restrictive `connect-src` CSP
9. `modAPI.utils.getTechniqueSlots(realm)` used for stance slot counts in context
10. `modAPI.utils.t()` used for `Translatable` display name resolution
11. Soul shard delve state extracted when active

## Replace Immediately

These old patterns should now be considered second-class:

- primary reads from `window.gameStore`
- "modAPI is too limited" as a baseline assumption
- default plans that jump straight to Fiber or DOM scraping
- monkey-patching to discover drops or lifecycle events that now have official hooks

## Adopted With Caution

- `onLocationEnter` — proactive location advice.
- `onAdvanceDay` and `onAdvanceMonth` — conservative use for major time changes, rate limited.
- `onCompleteCombat` and `onCompleteCrafting` — short post-activity guidance.

## Good Future Fits For This Mod

- `onGenerateExploreEvents` — useful if the mod explains exploration pressure.
- `gameData.monsters` — could enrich combat context with enemy school/technique details.
- `onReduxActionPayload` — could observe specific state transitions more granularly than `subscribe()`.

## Avoid By Default

- `onReduxAction` / `onReduxActionPayload` — powerful but reducer-time. Use only when snapshots and subscriptions are insufficient.
- `onCalculateDamage`, `onEventDropItem` — mutate gameplay outcomes, do not fit read-only advisor contract.
- `makeSave/loadSave/listSaves` — save management is out of scope for an advisor mod.

Note: `onBeforeCombat` is adopted as a read-only advisor hook (returns inputs unchanged). `onLootDrop` is adopted for post-loot item guidance.
