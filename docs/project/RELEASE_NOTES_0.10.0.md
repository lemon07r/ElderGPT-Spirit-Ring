---
title: Release Notes 0.10.0
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: package.json,src/integration,src/ai/knowledge,scripts/installed-game-runtime.js + installed AFNM 0.7.17-d8ae6ce
review_cycle_days: 90
related_files: package.json,src/integration/contextEngine.ts,src/integration/sectContext.ts,src/integration/displayText.ts,docs/assets/workshop-description.bbcode
---

# ElderGPT Spirit Ring 0.10.0

Targets **AFNM 0.7.17** with `afnm-types@0.7.17`. The installed build inspected
for this release is `0.7.17-d8ae6ce`.

## Player-Facing Changes

- Event-history text now resolves deferred/plural translations on each snapshot,
  including after language changes, rather than leaking objects into prompts.
- Adds the focused-quest marker and compact read-only sect context: rank,
  carried vault slips, accepted missions, and active/ready favour services.
  Detailed mission/service lists are capped at five each and shown only while
  idle/in events; totals remain explicit.
- Refreshes guidance for unified player/enemy health (no cultivator resistance),
  Charisma-driven party capacity, reworked tournaments, sect progression,
  removed altar access, and spirit-stone-free instant crafting.
- Covers nine harmonies, including Captivating Cadence and Returning Cycle,
  plus the four zero-default Qi/Stability cost reduction/penalty stats.
- Refreshes the Workshop description, preserving the Other Mods, collection,
  and mod-template links. The release owner must use `--sync-workshop-page`
  when uploading to publish that copy.

## Runtime Evidence (Static Inspection, Not A Game Launch)

Use `bun run runtime:oracle` and `bun run runtime:grep -- '<pattern>'`.
The paths below are relative to the oracle's extracted runtime directory.

| Check | Installed bundle evidence |
| --- | --- |
| Exact build and relative settings file | `dist-electron/main/index.js:2` (`0.7.17-d8ae6ce`, `./settings.json`) |
| Only injected game selector | `dist-electron/Game.js:3244`: `combat-victory` dialog contains `[aria-live="assertive"]`; existing placement `after` stays valid (dialog also handles defeat) |
| Snapshot, subscription, injection, React globals | `Game.js:6588`: `injectUI`, `subscribe`, `getGameStateSnapshot`, `window.React`, `window.ReactDOM` |
| Renderer root | `Game.js:2` imports `yt` from `index.js`; `Game.js:6588` sets `PWd=e(yt())`, then `window.ReactDOM=PWd`; `index.js:10` defines `createRoot` and exports that renderer factory |
| Sect, missions, and slips | `Game.js:2644`: sect initializer/services and mission accepted lists; `Game.js:1927`: vault definitions/slips; `Game.js:3698`: inventory slip payment |
| New stat/harmony knowledge | `Game.js:815`: cost stat names and Charisma tooltip; `Game.js:1492–1549`: all nine harmony configs, complexity, and state machines; `Game.js:1555`: zero-default cost modifiers |
| Reworked tournaments | `Game.js:2644`: tournament configs and combat/crafting round kinds; `reduxState.d.ts:368–447`: config ID, seed, carried health/buffs, crafting challenge |
| Progression guidance | `Game.js:1700`: Third Mountain mission/promotion quest; `Game.js:1977`: disciple room rank upgrades; `Game.js:3471`: physical-stat choice; `Game.js:1663,1677,2231`: hardmode-gated altars/blueprint; `Game.js:3082`: instant-craft ingredient deduction and time advancement without a spirit-stone charge |

No main-menu selector, game Fiber hook, removed party/tournament field,
`tPlural`, old `calculateDamage` signature, or `inside` injection placement is
used by ElderGPT. Its remaining DOM checks address its own overlay root and
standard form controls. No gameplay-mutating hooks were added.

## Tooling And Verification

The old full ASAR extractor failed on the current 2.9 GB archive with a signed
32-bit read overflow. Runtime inspection now extracts only source/metadata via
positional reads, caches under `$HOME/.local/tmp/afnm/eldergpt/runtime/`, and
recognizes the new minified bundle layout. A sparse >2 GiB archive regression
test covers the failing path without downloading tools or copying media.

Validation commands: `bun install`, `bun run release:validate` (typecheck,
tests, production ZIP, UI harness build, package validation, runtime oracle,
docs checks), `bun run docs:check`, and `bun run runtime:oracle`.
The release gate passed on 2026-10-22: `12 passed, 12 total` test suites;
`47 passed, 47 total` tests; `webpack 5.105.4 compiled successfully`;
`Validated afnm-eldergpt-spirit-ring.zip (2 files)`; UI harness bundled 41 modules;
all reported ModAPI/UI capabilities present; 14 Markdown files checked with no
broken local links and passing metadata/freshness/authority checks.
`bun install` installed `afnm-types@0.7.17` with warnings that its MUI 9.4 peers
are newer than this repo's MUI 7 dependencies. Runtime UI libraries stay external
to the mod bundle; typecheck and package validation pass without bundling
`afnm-types` runtime JavaScript.
Runtime state/selector evidence is static; live controller navigation and a
real provider round-trip remain manual release-owner checks. No commit, push,
tag, Workshop upload, or gameplay mutation is part of this preparation.
