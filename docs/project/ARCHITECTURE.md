---
title: Mod Architecture
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: src/integration, src/ui, src/ai, src/config, installed AFNM runtime
review_cycle_days: 30
related_files: src/integration/index.ts,src/integration/gameState.ts,src/integration/contextEngine.ts,src/integration/gameLookup.ts,src/integration/proactive.ts,src/ui/chatTurn.ts,src/ui/chatSession.ts,src/ui/sessionManager.ts,src/config/settings.ts,src/ai/agent.ts,src/ai/client.ts,src/ai/messages.ts,src/ai/tools.ts,src/ai/usage.ts
---

# Architecture

ElderGPT Spirit Ring is a read-only advisor mod: observe live state, build compact
context, and send it to a user-supplied OpenAI-compatible or Anthropic endpoint.
It never mutates Redux or core gameplay. Saving a requested player preference
changes only the mod's local settings.

## Runtime Shape

The current architecture has seven parts:

1. `src/integration/gameState.ts`
   This is the single bridge into live game state. It prefers `window.modAPI.getGameStateSnapshot()` and `window.modAPI.subscribe()`, then falls back to `window.gameStore` only if the official API is unavailable.

2. `src/integration/contextEngine.ts` and domain adapters
   These normalize the raw snapshot into `GameContext`. Equipment is resolved
   through `utils.getFullItem()` so enchantments and harmony augments are
   reflected; dedicated adapters normalize equipment and the current soul-shard
   run/progression shape. Crafting context includes the selected harmony,
   harmony state, complexity, and native crafting auto-use slots. Research queue
   return/glyph state and Core Formation altar aggregates are also exposed.
   `sectContext.ts` reads rank/services, carried vault slips, and accepted
   missions; quest focus and deferred history translations follow 0.7.17 state.

3. `src/ai/knowledge/`
   Dynamic game knowledge system. Maintains compiled knowledge blocks for crafting, combat, cultivation, and stat formulas that are injected into prompts based on current game state. The selector uses budget-based `tryAdd()` to prioritize status-relevant knowledge first, then complementary blocks if budget allows.

4. `src/ai/agent.ts`, `client.ts`, `messages.ts`, `tools.ts`, `usage.ts`,
   `modelLimits.ts`, `compaction.ts`
   Multi-provider chat client supporting OpenAI-compatible and Anthropic endpoints with streaming. Model limit detection probes provider-specific APIs (Anthropic, LM Studio, Ollama) with a static fallback table covering GPT, Claude, Llama, Qwen, Gemma, DeepSeek, Mistral, Kimi, and GLM model families. Default context window is 32K for unknown models. Conversation compaction uses anchored iterative summarization to keep long conversations within context limits.
   Send/Retry alone use the eight-round lookup loop. Provider-neutral definitions
   and guarded dispatch delegate all game reads to `integration/gameLookup.ts`;
   auxiliary requests remain tool-free. The single API builder filters display
   history and attaches state to the newest player message. Transport owns
   cancellation, byte-idle/total timeouts, bounded retries, and parameter fallbacks.
   Usage parsing feeds session-local compaction estimates, not a billing ledger.

5. `src/ui/*`
   The persistent body-mounted overlay is complemented by targeted `injectUI()`
   entry points. `chatTurn.ts` owns Send/Retry; ChatPanel coordinates controls,
   sessions, dragging, status, and display. The transcript shows markdown,
   Stop/Retry state, lookup rows, and one-time capability notices.

6. `src/ui/chatSession.ts` and `src/ui/sessionManager.ts`
   Conversation history, unread state, loading state, and session persistence. Sessions are stored in localStorage with auto-naming. The session manager handles CRUD, active session tracking, and automatic pruning at 20 sessions.
   Persist text and optional error/stopped/lookup/notice metadata only, never raw
   tool protocol or live-state attachments. Old sessions require no migration.

7. `src/config/settings.ts`
   Persisted API/persona/UI settings, context/output overrides, optional
   temperature, streaming, records toggle (default on), and global memory notes
   (30 notes, 500 characters each; explicit-request-only tool saving).

## Advisor Data Flow And Cache Boundaries

```text
snapshot -> context + selected knowledge -> stable persona/RULES/notes prefix
player history -> buildApiMessages (+ current state on newest player only)
Send/Retry -> agent -> client -> provider
                      | tool calls -> tools -> gameLookup (read-only) / notes
                      | tool results -> request-local transcript -> provider
                      `-> concatenated text + display metadata -> session/UI
```

Anthropic places cache hints on the last system block, history immediately
before the latest player turn, and the last fixed tool definition (at most
three breakpoints). State stays out of the system prefix; tool protocol is
discarded after the turn. Caching benefits depend on the provider. Proactive
requests use current state without tools; title/compaction calls omit state,
notes, and tools. See [AI Client](AI_CLIENT.md), [Context Engine](CONTEXT_ENGINE.md),
and [UI Architecture](UI_ARCHITECTURE.md) for the detailed contracts.

## ModAPI-First Rules

For AFNM `0.7.x`, this mod should assume the following order of preference:

1. `window.modAPI.getGameStateSnapshot()` for read-only state.
2. `window.modAPI.subscribe()` for reactive updates.
3. `window.modAPI.injectUI()` for dialog/screen-local affordances.
4. `window.gameStore` as a read-only fallback.
5. Fiber or DOM scraping only for gaps that are confirmed to be absent from the official API.

Reverse-engineering should be centralized and justified. Do not reintroduce ad hoc store access, monkey-patching, or DOM scraping across unrelated files.

## Current Adoption

The repo currently adopts the official API as follows:

- Context extraction now runs from the official live snapshot first and supplements active combat reads from the read-only parts of `modAPI.combat` when available.
- The chat header reacts to live state through the official subscription path.
- A `combat-victory` inline CTA is injected through `injectUI()` to open the chat from a real game dialog.
- Proactive suggestions now use official lifecycle hooks for location entry, month rollover, long day advances, combat completion, crafting completion, loot drops, and pre-combat advice.
- Context extraction now includes `persistentEventLog` entries, `craftingTeamUpOverride` companion name, full equipment stats via item database lookup, player physical/social/affinity stats, combat entity stats, inventory, techniques, stances, quests, NPC relationships, and guild status.
- The overlay root div uses native bubble-phase event listeners (`capture: false`) to stop input propagation beyond the mod root after its controls handle events. It does not install game-wide capture hooks.

## Deliberate Non-Adoption

Some new APIs are intentionally documented but not used by default yet:

- `onReduxAction` / `onReduxActionPayload`
  These run inside or before the reducer. They are powerful but high-risk for a read-only advisor mod and should only be used when a concrete need cannot be met by `subscribe()` and snapshots.

- `onCalculateDamage`
  This is a mutation hook. It does not align with the mod's observer-first design unless the project explicitly adds opt-in gameplay mutators later.

- `onEventDropItem`
  This changes rewards and therefore crosses the current read-only boundary.

Note: `onBeforeCombat` is now adopted as a read-only advisor hook (returns inputs unchanged) and `onLootDrop` is adopted for post-loot guidance.

## Known Gaps

- Lookups require a tool-capable model. Rejected tools fall back to ordinary chat
  for that endpoint/model until app restart; silently ignored tools are allowed.
- Source-only registry probes cannot initialize quests/locations fully; their
  lookup paths and in-game translations/resolvers are verified only with mocks.
  Static item sources are partial, and real shop/vault sources remain unverified.
- Provider smoke tests use mocked game data, not a running game. No live in-game
  test was performed for 0.11.0.

- Auto-battle state is still not cleanly exposed in the typed snapshot surface, so proactive suppression based on auto-battle remains a documented limitation.
- The persistent overlay still mounts to `document.body`; `injectUI()` is used as a complement, not a full replacement, because slot coverage across every relevant screen/dialog is still a maintenance concern.
- Proactive suggestions are rate-limited and intentionally conservative. The hook layer should stay small and should not become a generic automation engine.
