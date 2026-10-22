---
name: spirit-ring-ui
description: ElderGPT Spirit Ring UI skill. Activate for persistent overlay, chat panel, settings UI, injected Consult Spirit Ring button, harness validation, session management, pointer isolation, or src/ui changes.
---

# Spirit Ring UI

The main UI is a persistent body-mounted React/MUI overlay plus targeted `injectUI()` entry points.

## Activate When

- Editing `src/ui/*`, `src/config/settings.ts`, or `src/integration/uiBridge.tsx`
- Changing chat sessions, unread state, settings, markdown rendering, streaming display, or injected buttons
- Verifying visual behavior in harness or installed client

## Overlay Rules

- Keep the persistent root mounted to `document.body` until a deliberate architecture change replaces it.
- Use the installed runtime's `window.React` and `window.ReactDOM.createRoot()` surface where bootstrap code expects it.
- Preserve native mod-root event isolation for mouse, pointer, keyboard, input, focus, and wheel events. `src/ui/index.tsx` uses bubble-phase listeners (`capture: false`), not capture-phase listeners.
- Use `injectUI()` for targeted affordances like the `combat-victory` Consult Spirit Ring button (`[aria-live="assertive"]`, placement `after`), not as a full overlay replacement yet. Both target and dialog remain in AFNM 0.7.17; no main-menu selector is used.

## State Boundaries

- Local open/minimized/drag UI state stays in React components.
- Chat/session persistence lives in `src/ui/chatSession.ts` and `src/ui/sessionManager.ts`.
- Persisted configuration lives in `src/config/settings.ts`.
- Game state comes from the integration snapshot/subscription bridge.

## Validation

```bash
bun run ui:harness:build
bun run ui:harness:serve
```

Use the harness for open/close behavior, unread badges, session switching, settings layout, markdown rendering, and simulated proactive messages. Live game checks are only for runtime-specific overlay/injected UI behavior.

## Gotchas

1. **Game panels can steal events**: preserve native event stopping on the mod's overlay root without blocking its own control handlers.
2. **ReactDOM import paths can differ**: keep bootstrap aligned with installed runtime globals.
3. **Session pruning is intentional**: max 20 sessions; don't remove without UX/storage rationale.
4. **Injected button opens the same overlay**: avoid duplicate chat roots.

## References

- `docs/project/UI_ARCHITECTURE.md`
- `docs/project/LIVE_GAME_TESTING.md`
- `src/ui/ElderGPTApp.tsx`
- `src/ui/components/ChatPanel.tsx`
- `src/ui/sessionManager.ts`
- `src/integration/uiBridge.tsx`
