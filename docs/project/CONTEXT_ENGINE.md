---
title: Context Engine
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-04
source_of_truth: src/integration/contextEngine.ts + src/integration/gameState.ts
review_cycle_days: 30
related_files: src/integration/contextEngine.ts,src/integration/gameState.ts,src/ui/components/ChatPanel.tsx
---

# Context Engine

The context engine turns a live AFNM snapshot into a compact prompt payload. It is intentionally narrow: read the state, normalize it, and return a stable object that the AI client and UI can consume.

## Input Order

`extractContext()` should receive data in this order:

1. A provided `RootState` snapshot.
2. `readGameStateSnapshot()` from `src/integration/gameState.ts`.
3. A stable fallback object if no live state is available.

This keeps the normalization logic testable while still supporting live runtime access.

## What We Normalize

The current normalized payload includes:

- `source`
  `modapi-snapshot`, `redux-store`, or `unavailable`.

- `status`
  `InCombat`, `Crafting`, `Event`, or `Idle`.

- `screen` and `location`
  The current screen key plus a human-readable location name when it can be resolved from `modAPI.gameData.locations`.

- `player`
  Name, realm, realm progress, HP, Qi, money, favour, injury state, and party size.

- `calendar`
  Year, month, and day.

- `flagCount`
  A cheap signal for prompt context without serializing the full flag map by default.

- `combat`
  Enemy names/count, player HP, max HP, and spar state.

- `crafting`
  Recipe name, progress numbers, condition, harmony, step number, consumed pills, and recommended technique types.

## Design Constraints

- Keep the payload compact enough for repeated chat calls.
- Prefer explicit summaries over dumping the raw Redux snapshot into the model.
- Keep all game-shape assumptions in this file so future AFNM patches only require one integration pass.
- Treat the data as immutable even when the API offers mutation hooks elsewhere.

## Current Limitation

Auto-battle state is not yet modeled in the typed snapshot surface. The context engine exposes `autoBattle` as `boolean | null`; callers should treat `null` as “unknown”, not “off”.
