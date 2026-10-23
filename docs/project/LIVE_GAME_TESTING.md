---
title: Live Game Testing
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: scripts/installed-game-runtime.js,scripts/runtime/lookup-check.ts,scripts/runtime/lookup-browser.ts + installed AFNM runtime
review_cycle_days: 21
related_files: scripts/installed-game-runtime.js,scripts/runtime/lookup-check.ts,scripts/runtime/lookup-browser.ts,package.json,scripts/ui/agent-browser-harness.tsx,docs/project/RELEASE_PROCESS.md
---

# Live Game Testing

This repo should be tested against the installed game code, but agent workflows should avoid launching through Steam unless the task explicitly requires Steam-specific behavior.

## Best Default: Inspect The Installed Runtime Without Launching

Use the installed `app.asar` as the primary truth source.

Commands:

```bash
bun run runtime:oracle
bun run runtime:extract
bun run runtime:grep -- "injectUI|getGameStateSnapshot|onReduxAction"
```

What this gives us:

- the exact installed AFNM version
- cached inspection sources under `$HOME/.local/tmp/afnm/eldergpt/runtime/<fingerprint>/`
- a grep-able view of the real game bundle
- a way to verify modAPI changes without UI launch risk

For agent work, this is the preferred verification path for API surface, hook names, launcher behavior, and docs accuracy.

The extractor reads only package metadata and renderer/main source files using
positional ASAR reads. It does not download an extractor or unpack media/native
dependencies. This avoids full-extraction overflow on the 2.9 GB 0.7.17 archive.
`runtime:grep` prints matching excerpts with source line numbers so minified
lines do not flood the terminal; include `.{0,100}` around a token for context.
Set `AFNM_GAME_DIR` to inspect another installation.

## Initialized Renderer Lookup Checks (No Game Binary)

```bash
bun run runtime:lookup-check
bun run runtime:lookup-check --player       # opt-in scratch character/reducers
bun run runtime:lookup-check --player-only  # rerun just that stage
```

Requires Bun and Playwright with its Chromium channel installed. By default the
runner uses `$HOME/.bun/install/global/node_modules/playwright/index.mjs`; set
`PLAYWRIGHT_MODULE` to an absolute Playwright module path on another workstation.
It uses `AFNM_GAME_DIR` through the extractor, serves JS/CSS/HTML on an ephemeral
loopback port, and boots the **real renderer and mod loader**, with a metadata-only
probe exposing ModAPI. It bundles the actual ElderGPT tools/context code, not
replacement lookups, registries, translations, or game initialization.

Electron/preload calls have isolated in-memory stubs. No real saves are read;
save discovery returns empty. External requests are blocked, service workers are
disabled, and no Steam/native process or external LLM request is started. Nothing
is written to the installation or real save directory. Browser profiles/temp files
and JSON reports are under `$HOME/.local/tmp/eldergpt-runtime/`, outside the repo;
browser/context/server cleanup runs in `finally`. Missing media can cause audio
decode errors; reports retain renderer errors rather than claiming full UI coverage.

`en-audit.json` and `de-audit.json` record raw names, translated names, complete
tool outputs, per-call milliseconds/characters, failures, and IPC/error diagnostics.
Assertions cover 2–4 sampled entries in each of 17 populated categories: search by
key and translated name, get headers, readable tags/objects, 8,000-character search
and player caps / 6,000-character entry cap, and unchanged snapshots. German is
selected through the game's isolated `GameLanguage`/`languageManuallySet` sticky
state before initialization; the runner waits for the real translation module and
checks 11 entries across items, techniques, and locations. This is sample coverage,
not exhaustive validation of every authored record. `mystical_regions` is
mod-populated and empty in the verified base game.

Six English item Sources sets are compared exactly against inspected raw records:
Festival Dumpling Ingredients and Flaring Yang Bud (markets), Xuanzang's Formation
Core (vault), Acknowledgement of Blossom and Feicuiman Chitin (drops, including a
condition), and Ironflesh Pill (sublime recipe output). All matched on AFNM
`0.7.17-d8ae6ce`; sources remain partial static listings, not current stock/access.

`--player` additionally saves `playable.json`. On the inspected
`0.7.17-d8ae6ce` build only, a hook appended to the **served response** calls the
real New Game thunk (`zLu`, using default start/stats, no backgrounds) and the real
inventory action (`L$`) to seed Festival Dumpling Ingredients x3. It never rewrites
the extracted bundle. The resulting Redux character has five combat and three
crafting techniques; all player-detail sections plus `extractContext` /
`formatGameState` and snapshot-immutability checks pass. Menu ModAPI gameplay
actions are no-ops without a loaded save, so the sandbox uses real reducers instead.
This verifies a constructed character snapshot, not playable UI/controller behavior
or a normal background's starting inventory. Other builds explicitly skip this
optional hook until its symbols are inspected; default lookup checks still run.

For 0.10.0, static inspection verified AFNM `0.7.17-d8ae6ce`, the combat-result
dialog/selector, snapshot/subscription APIs, lifecycle hooks, sect and quest
state, new harmonies/cost stats, and renderer globals. See
[RELEASE_NOTES_0.10.0.md](./RELEASE_NOTES_0.10.0.md) for exact bundle locations.
No live game or external LLM request was launched for this compatibility pass.

## Fast UI Smoke Tests Without The Game Runtime

Before touching the installed binary, use the local harness when the task is purely UI or session-state related:

```bash
bun run ui:harness:build
bun run ui:harness:serve
```

The harness stubs chat responses and includes buttons to simulate unread/proactive assistant messages. Use it for:

- open/close behavior
- message persistence across minimize/reopen
- unread badge behavior
- basic drag and pointer-event sanity

## Manual UI Testing Without Steam Relaunch Loops

The installed runtime currently reports:

- `supportsDisableSteamSentinel: true`
- `hasNativeLauncher: true`
- `hasHostLauncher: true`
- `disableSteamSentinelPath`: `<game directory>/disable_steam` (use the oracle's exact path)
  - **CRITICAL:** When finished testing, delete the `disable_steam` file so the game can communicate with Steam again. If left behind, workshop mods will not load.

Recommended manual flow on Linux:

1. Place the built mod zip in the installed `mods/` directory.
2. Create the empty `disable_steam` sentinel file next to the game executable.
3. Launch with `launch-native.sh` or `launch-host.sh`, not through the Steam UI.
4. Add an empty `devMode` file next to the executable when you want verbose logs.
5. When an agent needs proof of UI behavior, add `--remote-debugging-port=9222` and attach with `agent-browser connect 9222`.

Why:

- The main Electron process checks for `disable_steam`.
- Without that sentinel, the runtime may restart itself through Steam.
- The launch scripts already set the host/runtime environment for the installed binary.

Verified on April 6, 2026:

- direct launch through `launch-native.sh --remote-debugging-port=9222` worked without Steam relaunch
- the installed game re-extracted the new ElderGPT zip and logged mod metadata with the current game version
- `agent-browser` smoke checks confirmed the floating toggle rendered, the panel opened, minimizing and reopening preserved chat state, and `error.log` stayed empty

## When To Use Each Path

- Use runtime extraction/oracle for almost every agent task.
- Use `runtime:lookup-check` for initialized data/translation/resolver assertions without a native game launch.
- Use direct binary launch only for real UI/manual smoke tests.
- Do not make Steam-launch testing the default validation step for code or docs updates.
