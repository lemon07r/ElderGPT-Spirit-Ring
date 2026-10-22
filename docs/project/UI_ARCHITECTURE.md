---
title: UI Architecture
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: src/ui + src/ui/chatSession.ts + src/ui/sessionManager.ts + src/config/settings.ts + src/integration/uiBridge.tsx
review_cycle_days: 30
related_files: src/ui/index.tsx,src/ui/ElderGPTApp.tsx,src/ui/chatTurn.ts,src/ui/chatSession.ts,src/ui/sessionManager.ts,src/config/settings.ts,src/ui/components/ChatPanel.tsx,src/ui/components/ChatTranscript.tsx,src/ui/components/SettingsPanel.tsx,src/integration/uiBridge.tsx
---

# UI Architecture

## Overlay Strategy

The main chat UI is a persistent overlay mounted to `document.body` through `src/ui/index.tsx`.

This remains intentional for now:

- The mod needs one affordance that survives location, crafting, and event transitions.
- A body-mounted root is simpler than registering and maintaining `injectUI()` slots for every screen/dialog where the chat should remain reachable.
- The overlay should prefer the installed runtime's `window.React` and `window.ReactDOM` surface directly.
- The root div registers native bubble-phase event listeners (`capture: false`) for mouse, pointer, keyboard, input, focus, and wheel events to stop propagation beyond the mod root after its controls handle events.

Installed-runtime note:

- The installed AFNM runtime exposes a usable global `ReactDOM.createRoot()` surface, but agents should not assume a separate `react-dom/client` import path is interchangeable.
- Keep renderer bootstrap logic in `src/ui/index.tsx` aligned to the live runtime surface verified through direct-binary smoke tests.

## Official UI Integration

AFNM `0.7.x` supports `window.modAPI.injectUI()`, and the mod uses it for targeted affordances.

Current usage:

- `combat-victory`
  An inline `Consult Spirit Ring` button is injected after the dialog's
  `[aria-live="assertive"]` element and dispatches the persistent overlay's open
  event. The installed 0.7.17 dialog uses this ID for both victory and defeat.

Static inspection on 2026-10-22 found the dialog and target together in
`dist-electron/Game.js:3244`, injection/snapshot/subscription and React globals
in `Game.js:6588`, and `createRoot` in `dist-electron/index.js:10` (exported to
the mod through `PWd = e(yt())`). There are no main-menu selectors or game
Fiber hooks in ElderGPT; the other DOM checks address its own root and standard
form controls. This is bundle evidence, not a live controller/UI smoke test.

## Component Roles

- `ElderGPTApp`
  Owns minimized/open state, tracks unread chat count, and listens for global open requests from injected UI entry points.

- `SpiritRingToggle`
  The minimized floating affordance. It handles open/drag behavior and surfaces unread assistant messages while the panel is closed.

- `ChatPanel`
  Coordinates live state, session actions, requests, dragging, and panel mode.
  Rendering is split into `ChatTranscript`, `ChatComposer`, and
  `SessionControls` while retaining the same stores and state flow. Features:
  - Connection status indicator (green/yellow/red dot replacing dev jargon)
  - Session name display for non-default sessions
  - Session history panel with switch/delete
  - New Chat button in header
  - Shared `chatTurn.ts` Send/Retry pipeline: knowledge, compaction, then agent loop
  - Markdown rendering for assistant messages
  - Streaming intermediate/final text, Stop control, and current lookup label

- `ChatTranscript` / `ChatComposer`
  Display stopped replies without calling them failures; only the trailing error
  offers Retry. The compact, initially collapsed `Consulted the records (N)` row
  expands to lookup labels, marking failed lookups. Capability notices appear
  once per endpoint/model/app session and never enter model-visible history.

- `SettingsPanel`
  Provider/URL/key/model, persona, text/window sizes, streaming, proactive hints,
  auto-title, and context/output overrides with model-limit detection. Temperature
  is optional (blank means provider default). The timeout hint distinguishes
  streaming byte-idle time from non-streaming total request time. The records
  toggle defaults on and warns that some local models lack tool support.

- `MemoryNotesSection`
  Add/edit/delete global standing preferences, showing validation errors for
  blank notes, more than 500 characters, or the 30-note cap. Notes live in
  settings, not any one chat; they survive New Chat and session switches.

- `MarkdownText`
  Renders assistant messages with code blocks, inline code, bold, italic, lists, headers, horizontal rules, and markdown tables (pipe-delimited with separator rows).

- `LoadingAnimation`
  Animated yin-yang glyph while waiting; shows `Consulting the records: <label>`
  during lookup steps, including when intermediate reply text is already visible.

## Session Management

- `sessionManager.ts` -- Session CRUD with localStorage persistence. Sessions store `{ id, name, messages[], createdAt, updatedAt }`. Auto-naming from first user message. Max 20 sessions with oldest pruned.
- `chatSession.ts` -- Integrates with `sessionManager` for persistence. Restores active session on load. Auto-saves after each message. `startNewChat()` saves current session and creates a fresh one. `switchToSession()` saves and loads.

Assistant messages may persist optional `error`, `stopped`, `lookups:
{ label, ok }[]`, and `notice` metadata. Old messages without these fields still
load without migration. Intermediate and final text are concatenated into one
assistant reply. Raw tool calls/results and attached game state never persist.

`src/ai/messages.ts` is the single API builder: strips UI metadata and excludes
errors, stopped/empty messages, and leading greetings before transport, title,
or compaction requests. Latest reported advisor input usage and current lookup
label are session-local, ephemeral store fields; title usage cannot overwrite
the compaction input count.

Send and Retry use the same cancellation-aware pipeline. Retry removes the
failed reply and any intervening assistant turns back to the latest player
message, without appending a duplicate player message. Stop aborts the current
request/loop and keeps partial visible text marked stopped; an empty stopped
placeholder is removed. Automatic retries/fallbacks remain in the transport,
not duplicated in UI code. See [AI Client](AI_CLIENT.md) for exact limits.

## Harness Evidence

`bun run ui:harness:build` / `ui:harness:serve` provide simulated normal,
failure/Retry, proactive, and lookup turns. `Simulate Lookup Turn` drives the
real Send/agent pipeline against mock fetch and game data, producing search/get
labels and a final reply. The 0.11.0 browser check confirmed collapsed/expanded
lookup rows and preserved intermediate text; screenshot saved locally. This is
not an in-game controller/navigation test.

## State Boundaries

- Ephemeral UI state stays local React state.
- Conversation/session state lives in `src/ui/chatSession.ts` backed by `src/ui/sessionManager.ts`.
- Persisted configuration lives in `src/config/settings.ts`.
- Game state comes from the official snapshot/subscription bridge.
- Cross-entry-point open behavior uses a small custom event bridge instead of wiring UI concerns into the game-state adapter.
