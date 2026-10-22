---
title: Context Engine
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: src/integration/contextEngine.ts + src/integration/gameState.ts + src/integration/gameLookup.ts + src/ai/knowledge/
review_cycle_days: 30
related_files: src/integration/contextEngine.ts,src/integration/gameState.ts,src/integration/gameLookup.ts,src/ai/knowledge/index.ts,src/ai/knowledge/statFormulas.ts,src/ai/messages.ts,src/ui/chatTurn.ts,src/config/settings.ts
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

- **Equipment** (always present): descriptors are resolved with
  `modAPI.utils.getFullItem()` and include crafting `stats`, combat
  `combatStats`, root stats, buffs, enchantment, rarity/realm, and
  `harmonyAugment.type`/`quality`.

- **Combat** (when in combat): enemy names/count, player HP/maxHP, selected nonzero `CombatStatsMap` fields (power, defense, dr, barrier, critchance, school boosts/resistances, etc.), spar state. Unified health values are used directly, without a cultivator-resistance conversion.

- **Crafting** (when crafting): recipe and bars, selected harmony,
  harmony-specific state, complexity multiplier, native crafting auto-use
  slots, companion, recommendations, and full crafting stats.
  The generic stat map preserves the four 0.7.17 cost reduction/penalty fields;
  harmony identifiers include Captivating Cadence and Returning Cycle.

- **Research**: current material queue, remaining/discovered recipes, progress,
  material-return state, and installed harmony glyphs.

- **Core Formation altars**: beaten altar names plus the aggregated combat and
  crafting reward scalings returned by
  `modAPI.actions.getCoreFormationAltarStats()`.

- **Soul-shard delve**: selected delve, ordered-run room/stage indexes, qither,
  difficulty, blessings/curses/rewards, and per-delve progression. The removed
  floor/max-floor assumption is not used.

- **Inventory**: item names and stack counts (up to 50 items).

- **Techniques**: known combat technique names.

- **Crafting actions**: known crafting technique names.

- **Stances**: stance names with technique sequences and fill count vs max technique slots (realm-dependent via `getTechniqueSlots`).

- **Quests**: translated active quest names with step progress and focused-quest marker.

- **NPCs**: character names, approval, relationship tier, following state (only NPCs with non-zero approval or who are following).

- **Guild**: selected guild name, rank, approval.

- **Sect**: rank, carried vault-slip counts (identified by live vault definitions,
  not guessed names), total accepted mission/pending service counts, and up to
  five live accepted missions and five active/ready services. Missions come from
  location building state intersected with live quests, services from `sect`;
  none of these paths dispatches actions. Quests no longer active and collected
  services are omitted; completed objectives awaiting turn-in can still appear.

- **Recent events**: first 5 `persistentEventLog` entries (runtime's newest-first
  order), with date and text resolved through `utils.t()` on every extraction.
  Deferred and plural translation objects never enter the string payload.

## System Prompt Structure

`getSystemPrompt()` builds a consolidated prompt with no duplicated instructions:

1. **Persona block** -- compact personality/style instructions: Elder, Calculator,
   or a player-supplied Custom prompt.

2. **Rules block** -- one access/fabrication/response block. With `gameLookups`
   enabled, use records for details/full inventory rather than guessing; do not
   re-query state already shown, prefer search then get, and never claim an
   unperformed lookup. Disabled: retain the unequipped-stats/hidden-internals
   CANNOT-see boundary. Rules depend on the setting, not the current turn.

3. **Knowledge block** -- status-driven game knowledge injected via `src/ai/knowledge/`. See below.

4. **Player notes** -- normalized global preferences, creation-ordered, without
   timestamps in the prompt. Settings supports add/edit/delete, up to 30 notes
   of 500 characters each. `save_note` requires an explicit player request.

This stable prefix contains **no live state**. `formatGameState()` supplies a
separate `<game_state captured_at_send>` block on the newest player message via
the single `buildApiMessages()` boundary. State and tool transcripts are not
persisted. Tool-result user blocks and the final-answer user note do not become
the state target. Title and compaction requests remain state/notes/tool-free;
proactive advisor requests use the same builder with current state, but no tools.

For fixed persona, knowledge, notes, and lookup setting, the system prefix is
byte-identical across turns. Selected knowledge can still change with activity
or token budget. Anthropic caches the last system block, the history before the
latest player message, and the last tool definition; see [AI Client](AI_CLIENT.md).

## On-Demand Records (`src/integration/gameLookup.ts`)

The regular snapshot stays compact. Tool-capable models can expand carried and
stored inventory into item descriptions/stats, known combat/crafting techniques,
or authored registry entries (items, buffs, monsters, quests, locations, recipes,
breakthroughs, and other indexed categories). Translation/tooltip helpers are
read-only; arbitrary authored functions/scaling are not executed. Functions,
React elements, cyclic references, and media are omitted from bounded output.

Item sources index static shops/vaults, monster drops, and recipe outputs when
available. They are partial listings, not guarantees of current availability.
No action, save/load, reward, purchase, or gameplay mutation is exposed.

Verification is partial: source-only real-data probes covered nine registries
and eleven search/get pairs in AFNM 0.7.17. Quest/location initialization did not
complete outside the game, and in-game translation/resolver and real shop/vault
behavior remain mocked-only. The provider protocol smoke uses synthetic data;
it does not close those runtime gaps. No live in-game test was run for 0.11.0.

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
| Core Formation altars | When available | When available | When available |
| Quests | No | No | Yes |
| NPCs | No | No | Yes |
| Reputation & Guild | Always | Always | Always |
| Sect rank & carried slips | When available | When available | When available |
| Sect missions & services | No | No | When available |
| Recent events | Always | Always | Always |

## Dynamic Knowledge System

Knowledge files live in `src/ai/knowledge/`:

- `gameOverview.ts` -- always included. AFNM overview, core loop, key concepts.
- `statFormulas.ts` -- verified stat names and calculation boundaries, not a formula calculator. Included alongside the primary status-driven block.
- `combatKnowledge.ts` -- primary when `status === 'InCombat'`. Schools, damage types, tactical principles.
- `craftingKnowledge.ts` -- primary when `status === 'Crafting'`. Techniques, harmony minigames, synergies.
- `cultivationKnowledge.ts` -- primary when idle/event. Realms, progression, strategy.

The `selectKnowledge()` function uses a budget-based `tryAdd()` approach: primary knowledge first, then stat formulas, then complementary blocks if budget allows. This prevents knowledge from crowding out conversation history.

## Design Constraints

- Keep the payload compact; tiered formatting avoids dumping irrelevant sections.
- Use human-readable formatted context, not raw JSON dumps.
- Keep all game-shape assumptions in `src/integration/` adapters.
- Equipment stats use `utils.getFullItem()` with `modAPI.gameData.items` as fallback.
- Token budgets prevent knowledge injection from crowding out conversation history.
- System prompt is assembled in one place with no duplicated instructions across blocks.
