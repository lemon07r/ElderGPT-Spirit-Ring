---
title: Mod Architecture
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-11
source_of_truth: src/integration, src/ui, src/ai, src/config, live AFNM 0.6.50 runtime
review_cycle_days: 30
related_files: src/integration/index.ts,src/integration/gameState.ts,src/integration/contextEngine.ts,src/integration/proactive.ts,src/ui/chatSession.ts,src/ui/sessionManager.ts,src/config/settings.ts,src/ui/components/ChatPanel.tsx,src/ai/client.ts,src/ai/knowledge/index.ts,src/ai/compaction.ts,src/ai/modelLimits.ts
---

# Architecture

ElderGPT Spirit Ring is a read-only advisor mod. The mod should observe the live game state, build a compact context payload, and send that payload to a user-supplied OpenAI-compatible chat endpoint. It must not mutate the Redux store or core gameplay as part of its normal operation.

## Runtime Shape

The current architecture has seven parts:

1. `src/integration/gameState.ts`
   This is the single bridge into live game state. It prefers `window.modAPI.getGameStateSnapshot()` and `window.modAPI.subscribe()`, then falls back to `window.gameStore` only if the official API is unavailable.

2. `src/integration/contextEngine.ts`
   This normalizes the raw snapshot into a compact `GameContext` object and builds the system prompt. System prompts include expanded persona instructions, dynamic knowledge injection, human-readable formatted game state, and response guidelines. Game-shape knowledge belongs here, not spread across UI components.

3. `src/ai/knowledge/`
   Dynamic game knowledge system. Maintains compiled knowledge blocks for crafting, combat, and cultivation that are injected into prompts based on current game state. The selector function respects a token budget to avoid crowding out conversation history.

4. `src/ai/client.ts`, `src/ai/modelLimits.ts`, `src/ai/compaction.ts`
   Multi-provider chat client supporting OpenAI-compatible and Anthropic endpoints with streaming. Model limit detection probes provider-specific APIs (Anthropic, LM Studio, Ollama) with a static fallback table. Conversation compaction uses anchored iterative summarization to keep long conversations within context limits.

5. `src/ui/*`
   The main chat UI is a persistent body-mounted overlay. We also use `window.modAPI.injectUI()` for targeted in-game entry points. The chat panel includes session management (history, switching, new chat), connection status indicator, markdown rendering, and streaming display.

6. `src/ui/chatSession.ts` and `src/ui/sessionManager.ts`
   Conversation history, unread state, loading state, and session persistence. Sessions are stored in localStorage with auto-naming. The session manager handles CRUD, active session tracking, and automatic pruning at 20 sessions.

7. `src/config/settings.ts`
   Persisted settings including API configuration, persona, UI preferences, context/output limit overrides, and streaming toggle.

## ModAPI-First Rules

As of AFNM `0.6.50`, this mod should assume the following order of preference:

1. `window.modAPI.getGameStateSnapshot()` for read-only state.
2. `window.modAPI.subscribe()` for reactive updates.
3. `window.modAPI.injectUI()` for dialog/screen-local affordances.
4. `window.gameStore` as a read-only fallback.
5. Fiber or DOM scraping only for gaps that are confirmed to be absent from the official API.

Reverse-engineering should be centralized and justified. Do not reintroduce ad hoc store access, monkey-patching, or DOM scraping across unrelated files.

## Current Adoption

The repo currently adopts the new API in four places:

- Context extraction now runs from the official live snapshot first.
- The chat header reacts to live state through the official subscription path.
- A `combat-victory` inline CTA is injected through `injectUI()` to open the chat from a real game dialog.
- Proactive suggestions now use official lifecycle hooks for location entry, month rollover, long day advances, combat completion, crafting completion, loot drops, and pre-combat advice.
- Context extraction now includes `persistentEventLog` entries and `craftingTeamUpOverride` companion name for richer AI prompts.

## Deliberate Non-Adoption

Some new APIs are intentionally documented but not used by default yet:

- `onReduxAction`
  This runs inside the reducer. It is powerful but high-risk for a read-only advisor mod and should only be used when a concrete need cannot be met by `subscribe()` and snapshots.

- `onCalculateDamage`
  This is a mutation hook. It does not align with the mod's observer-first design unless the project explicitly adds opt-in gameplay mutators later.

- `onEventDropItem`
  This changes rewards and therefore crosses the current read-only boundary.

Note: `onBeforeCombat` is now adopted as a read-only advisor hook (returns inputs unchanged) and `onLootDrop` is adopted for post-loot guidance.

## Known Gaps

- Auto-battle state is still not cleanly exposed in the typed snapshot surface, so proactive suppression based on auto-battle remains a documented limitation.
- The persistent overlay still mounts to `document.body`; `injectUI()` is used as a complement, not a full replacement, because slot coverage across every relevant screen/dialog is still a maintenance concern.
- Proactive suggestions are rate-limited and intentionally conservative. The hook layer should stay small and should not become a generic automation engine.
