---
name: spirit-ring-runtime
description: ElderGPT Spirit Ring runtime integration skill. Activate for game-state extraction, context normalization, ModAPI snapshots/subscriptions, proactive hooks, read-only boundaries, runtime oracle checks, or src/integration changes.
---

# Spirit Ring Runtime

ElderGPT Spirit Ring is a read-only advisor. Runtime integration observes the game, builds context, and must not mutate gameplay by default.

## Activate When

- Editing `src/integration/*`
- Changing `GameContext`, snapshot extraction, proactive hooks, or injected entry points
- Verifying ModAPI assumptions or runtime drift

## Source Priority

1. `window.modAPI.getGameStateSnapshot()` for read-only state.
2. `window.modAPI.subscribe()` for reactive updates.
3. `window.modAPI.injectUI()` / `addScreen()` for targeted UI affordances.
4. `window.gameStore` read-only fallback for verified gaps.
5. Fiber/DOM scraping only after runtime oracle confirms no official path.

## Boundaries

- Keep game-shape assumptions centralized in `src/integration/`.
- Do not add gameplay-mutating hooks to the default advisor path.
- `onBeforeCombat` may be read-only if it returns inputs unchanged.
- `onCalculateDamage`, `onEventDropItem`, and similar mutation hooks are out of scope unless the user explicitly asks for opt-in mutators.
- Lookup access stays in `src/integration/gameLookup.ts`: registry reads,
  current snapshot, and whitelisted read-only translation/item/technique helpers.
  `src/ai/tools.ts` owns stable definitions, validation, bounds, and guarded
  dispatch. `save_note` changes mod settings only, on explicit player request.
- Lookup serialization drops functions/React/media/cycles and enforces depth
  and size limits. Never invoke arbitrary conditions, dynamic authored
  functions, scaling evaluators, or gameplay actions to fill a missing detail.

## Context Engine Checklist

- Keep context compact and status-tiered.
- Include only relevant high-signal sections for combat/crafting/idle state.
- Resolve equipment through `modAPI.gameData.items` when available.
- Resolve stance slot counts through `modAPI.utils.getTechniqueSlots(realm)`.
- Resolve translatable display names through `modAPI.utils.t()` when available.
- Aggregate beaten Core Formation altar rewards through
  `modAPI.actions.getCoreFormationAltarStats()` when available.
- Preserve the research queue's `materialReturned` state.
- Keep system prompt rules consolidated; avoid duplicated instruction blocks.
- Stable prefix is persona/RULES/selected knowledge/global notes, not live state.
  Lookup guidance depends on gameLookups; disabled retains the CANNOT-see rule.
  The single API builder attaches state only to the latest player message;
  tool results/final notes must not move that target or enter persistence.
- AFNM 0.7.17 event history text/name overrides are `Translatable`; resolve display text through `utils.t()` on each extraction, never send objects as strings.
- Sect rank/services are on `snapshot.sect`; accepted missions are on location building state plus quests, and vault slips are inventory items identified by vault definitions. Keep these lists compact and read-only.
- Crafting stats use `qiCostReduction`, `qiCostPenalty`, `stabilityCostReduction`, and `stabilityCostPenalty`, not the removed percentage-cost multipliers. There are nine built-in harmonies.

## Lookup Verification Limits

`bun run runtime:lookup-check` boots the extracted real AFNM renderer/mod loader
in isolated Chromium, not the game binary. On `0.7.17-d8ae6ce`, assertions cover
2–4 sampled entries in all 17 populated categories, including quests/locations,
English translation/tag readability, caps, timings, unchanged snapshots, and six
exact static Sources comparisons. German checks cover 11 entries in three
categories through the real translation module. `mystical_regions` is empty in
the verified base game; mods populate it. Coverage is sampled, not exhaustive.

`--player` opts into a build-pinned served-response hook calling the real New
Game thunk/inventory reducer in the sandbox only; all player sections and context
formatting pass on that constructed Redux character. It does not test playable
UI/controller behavior. Do not use menu ModAPI gameplay actions to seed it:
`hasSave: false` makes those actions no-ops. Reports/temp profiles stay under
`$HOME/.local/tmp/eldergpt-runtime/`; no real save, native game/Steam process,
installation write, or provider call is involved. See LIVE_GAME_TESTING.md.
Item sources remain partial static listings, not promises of current stock.
Historical provider smoke tests used synthetic game data, not these registries.

## Documentation And Skill Stewardship

If runtime docs, this skill, or any project skill/doc is wrong, stale, duplicated, or unclear, correct it in the same pass. The read-only boundary and ModAPI priority order are safety-critical; do not leave outdated guidance for future agents.

## Validation

```bash
bun run runtime:oracle
bun run runtime:grep -- "getGameStateSnapshot|subscribe|injectUI|onReduxAction"
bun run test
```

Run `bun run docs:check` when authoritative project docs change.

## References

- `docs/project/ARCHITECTURE.md`
- `docs/project/CONTEXT_ENGINE.md`
- `docs/project/LIVE_GAME_TESTING.md`
- `src/integration/gameState.ts`
- `src/integration/contextEngine.ts`
