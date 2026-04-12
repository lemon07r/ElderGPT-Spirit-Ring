---
title: UI Architecture
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-12
source_of_truth: src/ui + src/ui/chatSession.ts + src/ui/sessionManager.ts + src/config/settings.ts + src/integration/uiBridge.tsx
review_cycle_days: 30
related_files: src/ui/index.tsx,src/ui/ElderGPTApp.tsx,src/ui/chatSession.ts,src/ui/sessionManager.ts,src/config/settings.ts,src/ui/components/ChatPanel.tsx,src/ui/components/SettingsPanel.tsx,src/ui/components/SpiritRingToggle.tsx,src/integration/uiBridge.tsx
---

# UI Architecture

## Overlay Strategy

The main chat UI is a persistent overlay mounted to `document.body` through `src/ui/index.tsx`.

This remains intentional for now:

- The mod needs one affordance that survives location, crafting, and event transitions.
- A body-mounted root is simpler than registering and maintaining `injectUI()` slots for every screen/dialog where the chat should remain reachable.
- The overlay should prefer the installed runtime's `window.React` and `window.ReactDOM` surface directly.
- The root div registers native capture-phase event listeners for mouse, pointer, keyboard, input, focus, and wheel events to prevent game panels from intercepting ElderGPT interactions.

Installed-runtime note:

- AFNM `0.6.50` exposes a usable global `ReactDOM.createRoot()` surface, but agents should not assume a separate `react-dom/client` import path is interchangeable.
- Keep renderer bootstrap logic in `src/ui/index.tsx` aligned to the live runtime surface verified through direct-binary smoke tests.

## Official UI Integration

AFNM `0.6.50` supports `window.modAPI.injectUI()`, and the mod now uses it for targeted affordances instead of treating it as future-only documentation.

Current usage:

- `combat-victory`
  An inline `Consult Spirit Ring` button is injected into the victory dialog and dispatches the same open event used by the persistent overlay.

## Component Roles

- `ElderGPTApp`
  Owns minimized/open state, tracks unread chat count, and listens for global open requests from injected UI entry points.

- `SpiritRingToggle`
  The minimized floating affordance. It handles open/drag behavior and surfaces unread assistant messages while the panel is closed.

- `ChatPanel`
  The main conversation surface. Reads live game state through `useSyncExternalStore`, reads settings/chat state from external stores. Features:
  - Connection status indicator (green/yellow/red dot replacing dev jargon)
  - Session name display for non-default sessions
  - Session history panel with switch/delete
  - New Chat button in header
  - Dynamic knowledge injection and compaction trigger before each send
  - Markdown rendering for assistant messages
  - Streaming response display with loading animation

- `SettingsPanel`
  Settings editor with: API provider selector, notched timeout slider, persona buttons (Elder/Calculator/Custom), text/window size controls, streaming toggle, proactive hints toggle. New: context window and max output token settings with auto-detection display from `modelLimits.ts`.

- `MarkdownText`
  Renders assistant messages with code blocks, inline code, bold, italic, lists, headers, horizontal rules, and markdown tables (pipe-delimited with separator rows).

- `LoadingAnimation`
  Animated yin-yang glyph with floating text and pulsing dots while waiting for AI response.

## Session Management

- `sessionManager.ts` -- Session CRUD with localStorage persistence. Sessions store `{ id, name, messages[], createdAt, updatedAt }`. Auto-naming from first user message. Max 20 sessions with oldest pruned.
- `chatSession.ts` -- Integrates with `sessionManager` for persistence. Restores active session on load. Auto-saves after each message. `startNewChat()` saves current session and creates a fresh one. `switchToSession()` saves and loads.

## State Boundaries

- Ephemeral UI state stays local React state.
- Conversation/session state lives in `src/ui/chatSession.ts` backed by `src/ui/sessionManager.ts`.
- Persisted configuration lives in `src/config/settings.ts`.
- Game state comes from the official snapshot/subscription bridge.
- Cross-entry-point open behavior uses a small custom event bridge instead of wiring UI concerns into the game-state adapter.
