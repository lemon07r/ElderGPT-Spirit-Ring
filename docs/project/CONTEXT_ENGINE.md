---
title: Context Engine
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-11
source_of_truth: src/integration/contextEngine.ts + src/integration/gameState.ts + src/ai/knowledge/
review_cycle_days: 30
related_files: src/integration/contextEngine.ts,src/integration/gameState.ts,src/ai/knowledge/index.ts,src/ui/components/ChatPanel.tsx
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
  Recipe name, progress numbers, condition, harmony, step number, consumed pills, recommended technique types, and companion name (from `craftingTeamUpOverride`).

- `recentEvents`
  The most recent 5 entries from `persistentEventLog`, each with year/month/day and text history for richer AI context.

## System Prompt Structure

`getSystemPrompt()` builds a multi-section prompt:

1. **Persona block** -- expanded character instructions with personality traits, advisory behaviors, and response constraints. Three built-in personas (Elder, Calculator, Custom) with significantly more guidance than a simple role description.

2. **Knowledge block** -- dynamic game knowledge injected based on current game state via `src/ai/knowledge/`. When crafting, the crafting knowledge block is included. When in combat, the combat knowledge block. A game overview is always included. Knowledge injection respects a token budget (30% of context window) to avoid crowding out conversation history.

3. **Formatted game state** -- human-readable annotated context (not raw JSON). Organized into labeled sections (CURRENT SITUATION, COMBAT, CRAFTING, RECENT EVENTS) with field explanations.

4. **Response guidelines** -- explicit rules for response length, what to reference, and when to be proactive vs reactive.

## Dynamic Knowledge System

Knowledge files live in `src/ai/knowledge/`:

- `gameOverview.ts` -- always included. Concise overview of AFNM, core game loop, key concepts.
- `craftingKnowledge.ts` -- injected when `status === 'Crafting'`. Covers technique types, core stats, harmony minigames, synergies, consumable economy, difficulty scaling.
- `combatKnowledge.ts` -- injected when `status === 'InCombat'`. Covers cultivation schools, damage types, mastery, tactical advice principles.
- `cultivationKnowledge.ts` -- injected when idle or during events. Covers 10 realms, progression strategy, general guidance.

The `selectKnowledge()` function in `src/ai/knowledge/index.ts` examines `GameContext.status` and injects appropriate blocks within a token budget.

## Design Constraints

- Keep the payload compact enough for repeated chat calls.
- Use human-readable formatted context, not raw JSON dumps.
- Keep all game-shape assumptions in `contextEngine.ts` so future AFNM patches only require one integration pass.
- Knowledge blocks should be LLM-optimized plain text, not markdown or JSON.
- Token budgets prevent knowledge injection from crowding out conversation history.
- Treat the data as immutable even when the API offers mutation hooks elsewhere.

## Current Limitation

Auto-battle state is not yet modeled in the typed snapshot surface. The context engine exposes `autoBattle` as `boolean | null`; callers should treat `null` as "unknown", not "off".
