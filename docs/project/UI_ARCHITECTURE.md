---
title: UI Architecture
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-06
source_of_truth: src/ui + src/ui/chatSession.ts + src/config/settings.ts + src/integration/uiBridge.tsx
review_cycle_days: 30
related_files: src/ui/index.tsx,src/ui/ElderGPTApp.tsx,src/ui/chatSession.ts,src/config/settings.ts,src/ui/components/ChatPanel.tsx,src/ui/components/SpiritRingToggle.tsx,src/integration/uiBridge.tsx
---

# UI Architecture

## Overlay Strategy

The main chat UI is a persistent overlay mounted to `document.body` through `src/ui/index.tsx`.

This remains intentional for now:

- The mod needs one affordance that survives location, crafting, and event transitions.
- A body-mounted root is simpler than registering and maintaining `injectUI()` slots for every screen/dialog where the chat should remain reachable.
- The overlay should prefer the installed runtime's `window.React` and `window.ReactDOM` surface directly.

Installed-runtime note:

- AFNM `0.6.49` exposes a usable global `ReactDOM.createRoot()` surface, but agents should not assume a separate `react-dom/client` import path is interchangeable.
- Keep renderer bootstrap logic in `src/ui/index.tsx` aligned to the live runtime surface verified through direct-binary smoke tests.

## Official UI Integration

AFNM `0.6.49` added `window.modAPI.injectUI()`, and the mod now uses it for targeted affordances instead of treating it as future-only documentation.

Current usage:

- `combat-victory`
  An inline `Consult Spirit Ring` button is injected into the victory dialog and dispatches the same open event used by the persistent overlay.

Why only a targeted use today:

- `injectUI()` is excellent for context-specific entry points.
- It is not yet a clean replacement for a persistent cross-screen chat launcher unless we commit to managing slot coverage across the whole game UI.

## Component Roles

- `ElderGPTApp`
  Owns minimized/open state, tracks unread chat count, and listens for global open requests from injected UI entry points.

- `SpiritRingToggle`
  The minimized floating affordance. It handles open/drag behavior and surfaces unread assistant messages while the panel is closed.

- `ChatPanel`
  The main conversation surface. It reads live game state through `useSyncExternalStore(subscribeToGameState, readGameStateSnapshot, ...)`, reads settings/chat state from external stores, shows a small state/source header, and exposes stable accessibility labels for smoke automation.

- `SettingsPanel`
  Thin editor for the shared settings store. It should remain ignorant of runtime integration details beyond clear user-facing labels.

- `chatSession` store
  Holds message history, loading state, panel visibility, and unread count outside the panel component so minimizing the overlay does not destroy the conversation.

- `settings` store
  Owns validated persisted settings and provides a single snapshot path for UI and proactive integrations.

## State Boundaries

- Ephemeral UI state stays local React state.
- Conversation/session state lives in `src/ui/chatSession.ts`.
- Persisted configuration lives in `src/config/settings.ts`.
- Game state comes from the official snapshot/subscription bridge.
- Cross-entry-point open behavior uses a small custom event bridge instead of wiring UI concerns into the game-state adapter.
