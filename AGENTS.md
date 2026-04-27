# Repository Guidelines: ElderGPT Spirit Ring

## Overview

ElderGPT Spirit Ring is a read-only contextual advisor mod for *Ascend From Nine Mountains*. Users supply an OpenAI-compatible or Anthropic endpoint/key; the mod reads live game state, builds a compact context payload, and renders a persistent chat overlay.

## Project Skills

Project skills live in `.agents/skills/` and should be loaded before long docs:

- `spirit-ring-runtime` for `src/integration/*`, ModAPI snapshots/subscriptions, proactive hooks, and context normalization.
- `spirit-ring-ai-client` for `src/ai/*`, providers, streaming, timeouts, model limits, compaction, and secrets handling.
- `spirit-ring-ui` for `src/ui/*`, overlay behavior, settings, injected buttons, sessions, and harness validation.

## Documentation And Skill Stewardship

If you discover inaccurate, stale, duplicated, or misleading information in any doc or `.agents/skills/*` file while working, fix it in the same change. Agents have standing permission to edit, correct, prune, or improve docs and skills so future agents do not inherit known traps. Verify corrections against code, tests, package scripts, or the installed-runtime oracle; if something cannot be fully verified, make the uncertainty explicit instead of presenting it as fact.

## Project Structure

- `src/mod.ts`: mod entry point and metadata.
- `src/integration/`: live game-state bridge, proactive hooks, context normalization, and ModAPI UI hooks.
- `src/config/`: persisted settings store.
- `src/ai/`: transport, model limit detection, compaction, and knowledge selection.
- `src/ui/`: overlay UI, chat session store, settings surfaces, and session manager.
- `src/utils/`: generic helpers.
- `docs/project/`: authoritative implementation and workflow docs.
- `docs/reference/`: supporting AFNM reference material.
- `scripts/`: runtime inspection, docs tooling, upload helpers.

## Commands

Use bun for dependency changes.

- `bun install`
- `bun run test`
- `bun run build`
- `bun run release:validate`
- `bun run ui:harness:build`
- `bun run runtime:oracle`
- `bun run runtime:extract`
- `bun run runtime:grep -- "<pattern>"`
- `bun run docs:check`
- `bun run workshop:preview`
- `bun run workshop:upload -- --change-note "..."`

## ModAPI Rules

As of AFNM `0.6.52`, use official APIs first:

1. `window.modAPI.getGameStateSnapshot()`
2. `window.modAPI.subscribe()`
3. `window.modAPI.injectUI()` / `addScreen()`
4. `window.gameStore` read-only fallback
5. Fiber/DOM scraping only for verified gaps

Do not add gameplay-mutating hooks to the default advisor path unless explicitly requested.

## Code Rules

- TypeScript strict mode, React TSX, 2 spaces, single quotes, trailing commas, LF endings.
- Keep game-shape assumptions centralized in `src/integration/`.
- Keep state extraction read-only.
- Keep persisted settings in `src/config/settings.ts` and conversation state in `src/ui/chatSession.ts` / `src/ui/sessionManager.ts`.
- Never log API keys or secrets.
- Prefer removing duplication over adding indirection.
- Add or update tests when normalizer/runtime/client behavior changes.

## Validation And Docs

- Runtime/API checks: `bun run runtime:oracle` and targeted `runtime:grep`.
- UI checks: `bun run ui:harness:build`; serve harness when visual evidence is needed.
- Docs changes: `bun run docs:check`.
- Live installed-client testing is opt-in; follow `docs/project/LIVE_GAME_TESTING.md`, avoid Steam launches by default, and delete `disable_steam` afterward.

## Release Workflow

- `package.json` is the release version source.
- Before publishing, bump version, run `bun run release:validate`, and confirm `builds/afnm-eldergpt-spirit-ring.zip` is the upload artifact.
- Regenerate Workshop preview if icon/branding changes.
- Normal uploads should preserve live Workshop title/description unless page-copy sync is explicitly requested.
- From a real git checkout, push the release commit to `main`, then push tag `vX.Y.Z` to trigger `.github/workflows/release.yml`.

## Code Search

This repo is indexed with Vera: `vera search "query"`, `vera grep "pattern"`, and `vera update .` after code changes.
