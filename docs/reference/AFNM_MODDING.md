---
title: AFNM Modding Reference
status: active
authoritative: false
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: installed AFNM 0.7.17-d8ae6ce runtime + afnm-types 0.7.17
review_cycle_days: 45
related_files: scripts/installed-game-runtime.js,AGENTS.md
---

# AFNM Modding Reference

This file is a practical reference for future ElderGPT work. It is not the primary source of truth for our implementation details; those live in `docs/project/*`.

## Upstream Sources Worth Checking First

- Docs site: `https://lyeeedar.github.io/AfnmExampleMod/`
- Example repo: `https://github.com/Lyeeedar/AfnmExampleMod`
- Local installed runtime oracle: `bun run runtime:oracle`

When AFNM changes, prefer those sources before reviving old reverse-engineering assumptions.

## Verified 0.7.17 Compatibility Notes

- Event history text and name overrides are `Translatable`, resolved via `utils.t()`.
- Player party membership no longer has `followSlotMember`; Charisma controls capacity.
- Sect rank/services are on `RootState.sect`. Missions are on location mission
  buildings and quest state; vault slips are inventory token items, described by
  vault building definitions. Do not guess extra fields on `SectState`.
- `focusedQuest` is on the quests slice. Character creation uses `imageId`.
- Tournament state is config-ID/seed based, with optional crafting challenges;
  do not read removed participants/participantPool/sourceStep fields.
- Crafting has nine built-in harmonies and four zero-default cost modifier
  stats: Qi/Stability Cost Reduction and Qi/Stability Cost Penalty.
- Player/enemy health is unified; cultivator resistance and the old
  `calculateDamage` defense-factor/resistance arguments are gone. School and
  toxicity resistances are not removed.
- `utils.tPlural` is removed; use `utils.t()` with a plural `Translatable`.
- `injectUI` uses the typed `InjectPlacement` union (including `before`, `after`,
  child insertions, and structural replacements), not legacy `inside`. ElderGPT's
  `combat-victory` + `[aria-live="assertive"]` + `after` integration remains in
  the installed bundle. The overlay uses no main-menu selector or game Fiber hook.

## Current Fallback Ladder

For AFNM `0.7.x`, use this order:

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
