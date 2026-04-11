---
title: Mod Architecture
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-06
source_of_truth: src/integration, src/ui, src/ai, src/config, live AFNM 0.6.50 runtime
review_cycle_days: 30
related_files: src/integration/index.ts,src/integration/gameState.ts,src/integration/contextEngine.ts,src/integration/proactive.ts,src/ui/chatSession.ts,src/config/settings.ts,src/ui/components/ChatPanel.tsx,src/ai/client.ts
---

# Architecture

ElderGPT Spirit Ring is a read-only advisor mod. The mod should observe the live game state, build a compact context payload, and send that payload to a user-supplied OpenAI-compatible chat endpoint. It must not mutate the Redux store or core gameplay as part of its normal operation.

## Runtime Shape

The current architecture has five parts:

1. `src/integration/gameState.ts`
   This is the single bridge into live game state. It prefers `window.modAPI.getGameStateSnapshot()` and `window.modAPI.subscribe()`, then falls back to `window.gameStore` only if the official API is unavailable.

2. `src/integration/contextEngine.ts`
   This normalizes the raw snapshot into a compact `GameContext` object for prompting and UI status. Game-shape knowledge belongs here, not spread across UI components.

3. `src/ui/*`
   The main chat UI is still a persistent body-mounted overlay because that gives a stable cross-screen affordance. We now also use `window.modAPI.injectUI()` for targeted in-game entry points where it improves UX without replacing the persistent overlay.

4. `src/ui/chatSession.ts` and `src/config/settings.ts`
   Conversation history, unread state, loading state, and settings now live in tiny external stores. This avoids losing chat state when the panel is minimized and gives non-React integration code a safe way to read current settings.

5. `src/ai/client.ts`
   This is a minimal OpenAI-compatible POST client. It should stay transport-focused and not absorb game-specific logic.

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
  This is a mutation hook. It does not align with the mod’s observer-first design unless the project explicitly adds opt-in gameplay mutators later.

- `onEventDropItem`
  This changes rewards and therefore crosses the current read-only boundary.

Note: `onBeforeCombat` is now adopted as a read-only advisor hook (returns inputs unchanged) and `onLootDrop` is adopted for post-loot guidance.

## Known Gaps

- Auto-battle state is still not cleanly exposed in the typed snapshot surface, so proactive suppression based on auto-battle remains a documented limitation.
- The persistent overlay still mounts to `document.body`; `injectUI()` is used as a complement, not a full replacement, because slot coverage across every relevant screen/dialog is still a maintenance concern.
- Proactive suggestions are rate-limited and intentionally conservative. The hook layer should stay small and should not become a generic automation engine.
