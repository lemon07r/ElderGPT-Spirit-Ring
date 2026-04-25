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

## Context Engine Checklist

- Keep context compact and status-tiered.
- Include only relevant high-signal sections for combat/crafting/idle state.
- Resolve equipment through `modAPI.gameData.items` when available.
- Keep system prompt rules consolidated; avoid duplicated instruction blocks.

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
