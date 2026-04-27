---
title: Live Game Testing
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-27
source_of_truth: scripts/installed-game-runtime.js + installed AFNM 0.6.52 runtime
review_cycle_days: 21
related_files: scripts/installed-game-runtime.js,package.json,scripts/ui/agent-browser-harness.tsx,docs/project/RELEASE_PROCESS.md
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
- a cached extracted runtime under `tmp/installed-game-runtime/<fingerprint>/`
- a grep-able view of the real game bundle
- a way to verify modAPI changes without UI launch risk

For agent work, this is the preferred verification path for API surface, hook names, launcher behavior, and docs accuracy.

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
- `disableSteamSentinelPath: /home/lamim/.local/share/Steam/steamapps/common/Ascend From Nine Mountains/disable_steam`
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
- Use direct binary launch only for real UI/manual smoke tests.
- Do not make Steam-launch testing the default validation step for code or docs updates.
