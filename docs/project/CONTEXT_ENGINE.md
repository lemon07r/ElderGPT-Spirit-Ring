---
title: Context Engine
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-27
source_of_truth: src/integration/contextEngine.ts + src/integration/gameState.ts + src/ai/knowledge/
review_cycle_days: 30
related_files: src/integration/contextEngine.ts,src/integration/gameState.ts,src/ai/knowledge/index.ts,src/ai/knowledge/statFormulas.ts,src/ui/components/ChatPanel.tsx
---

# Context Engine

The context engine turns a live AFNM snapshot into a compact, tiered prompt payload. It reads game state, normalizes it, and returns a stable `GameContext` object that the AI client and UI consume.

## Input Order

`extractContext()` receives data in this order:

1. A provided `RootState` snapshot.
2. `readGameStateSnapshot()` from `src/integration/gameState.ts`.
3. A stable fallback object if no live state is available.

## What We Normalize

The `GameContext` payload includes:

- **Core identity** (always present): source, status, screen, location, player name/realm/progress, HP, Qi, droplets, money, favour, injury, party size, calendar, physical stats, social stats, elemental affinities, reputation.

- **Equipment** (always present): each equipped item (clothing, talismans, artefacts, mount, cauldron, flame) is cross-referenced against `modAPI.gameData.items` to resolve full stats (defense, dr, power, buffs, etc.), enchantment, quality tier, rarity, and realm.

- **Combat** (when in combat): enemy names/count, player HP/maxHP, full `CombatStatsMap` (power, defense, dr, barrier, critchance, school boosts/resistances, etc.), spar state.

- **Crafting** (when crafting): recipe name, completion/perfection/stability/harmony, condition, step, consumed pills, recommended techniques, companion, full crafting stats (pool, control, intensity, etc.).

- **Inventory**: item names and stack counts (up to 50 items).

- **Techniques**: known combat technique names.

- **Crafting actions**: known crafting technique names.

- **Stances**: stance names with technique sequences and fill count vs max technique slots (realm-dependent via `getTechniqueSlots`).

- **Quests**: active quest names with step progress.

- **NPCs**: character names, approval, relationship tier, following state (only NPCs with non-zero approval or who are following).

- **Guild**: selected guild name, rank, approval.

- **Recent events**: last 5 `persistentEventLog` entries with date and text.

## System Prompt Structure

`getSystemPrompt()` builds a consolidated prompt with no duplicated instructions:

1. **Persona block** -- compact personality and style instructions. Three built-in personas (Elder, Calculator, Custom).

2. **Rules block** -- single unified block covering data access boundaries, fabrication rules, and response guidelines. Replaces the old separate KNOWLEDGE_BOUNDARIES + RESPONSE_GUIDELINES blocks.

3. **Knowledge block** -- status-driven game knowledge injected via `src/ai/knowledge/`. See below.

4. **Tiered game state** -- formatted context organized by relevance to current activity.

## Tiered Game State Formatting

The game state is formatted with status-aware section inclusion to avoid filling context with irrelevant data:

| Section | InCombat | Crafting | Idle/Event |
|---------|----------|----------|------------|
| Core identity & vitals | Always | Always | Always |
| Physical/social stats | Always | Always | Always |
| Equipment | Always | Always | Always |
| Combat stats | Yes | No | No |
| Crafting stats | No | Yes | No |
| Techniques | Yes | No | Yes |
| Stances (with slot counts) | Yes | No | Yes |
| Crafting actions | No | Yes | No |
| Inventory | Always | Always | Always |
| Quests | No | No | Yes |
| NPCs | No | No | Yes |
| Reputation & Guild | Always | Always | Always |
| Recent events | Always | Always | Always |

## Dynamic Knowledge System

Knowledge files live in `src/ai/knowledge/`:

- `gameOverview.ts` -- always included. AFNM overview, core loop, key concepts.
- `statFormulas.ts` -- game constants and stat scaling formulas from source code. Included alongside the primary status-driven block (combat formulas with combat, crafting formulas with crafting).
- `combatKnowledge.ts` -- primary when `status === 'InCombat'`. Schools, damage types, tactical principles.
- `craftingKnowledge.ts` -- primary when `status === 'Crafting'`. Techniques, harmony minigames, synergies.
- `cultivationKnowledge.ts` -- primary when idle/event. Realms, progression, strategy.

The `selectKnowledge()` function uses a budget-based `tryAdd()` approach: primary knowledge first, then stat formulas, then complementary blocks if budget allows. This prevents knowledge from crowding out conversation history.

## Design Constraints

- Keep the payload compact; tiered formatting avoids dumping irrelevant sections.
- Use human-readable formatted context, not raw JSON dumps.
- Keep all game-shape assumptions in `contextEngine.ts`.
- Equipment stats are resolved via `modAPI.gameData.items` lookup at extraction time.
- Token budgets prevent knowledge injection from crowding out conversation history.
- System prompt is assembled in one place with no duplicated instructions across blocks.
