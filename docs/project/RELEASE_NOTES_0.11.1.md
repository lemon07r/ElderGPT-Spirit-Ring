---
title: Release Notes 0.11.1
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: package.json,src/integration/gameLookup.ts,scripts/runtime + initialized AFNM 0.7.17-d8ae6ce renderer
review_cycle_days: 90
related_files: package.json,src/integration/gameLookup.ts,src/ai/tools.ts,src/ai/tools.test.ts,scripts/runtime/lookup-check.ts,scripts/runtime/lookup-browser.ts,docs/project/LIVE_GAME_TESTING.md
---

# ElderGPT Spirit Ring 0.11.1

Targets **AFNM 0.7.17**. Fixes mines and soul-shard delves displaying registry
IDs instead of translated location names in search/get results. The failure was
reproduced in the initialized renderer and a trimmed real-shaped unit regression.
No gameplay actions were added to the advisor.

## Runtime Verification

`bun run runtime:lookup-check` boots the extracted **real renderer and mod loader**
in isolated Chromium, with in-memory Electron/preload stubs. Assertions cover
2–4 sampled entries in all 17 populated categories: search by key/name, translated
headers, readable tooltip tags, output caps, timings, and snapshot immutability.
German checks cover 11 entries in three categories using the actual translation
module. `mystical_regions` is empty in this base game and mod-populated; the tool
description now explains that.

All six independently inspected item Sources sets matched raw market/vault/drop/
recipe records; no source-index fix was needed. Real-shaped unit fixtures preserve
vault rewards/cost, conditional drops, and sublime recipe output behavior.

The optional `--player` hook uses the real New Game thunk and inventory reducer in
the served scratch response only. The constructed Runtime Probe character has
five combat and three crafting techniques, plus an explicitly seeded item stack.
All player-detail sections and context extraction/formatting pass without changing
the snapshot. This does not establish native UI/controller playability.

See [Live Game Testing](./LIVE_GAME_TESTING.md) for commands, isolation boundaries,
build-pinned sandbox limitations, and reports under
`$HOME/.local/tmp/eldergpt-runtime/`. No game binary/Steam launch, installation or
real-save write, provider request, commit, push, or upload was performed for this
verification. Missing extracted media can produce audio errors; the lookup checks
are not full-renderer health or exhaustive authored-data tests.

## Checks

- `bun run runtime:lookup-check --player`: passed; 47 English and 11 German
  sampled entries, six exact Sources sets, initial and constructed player contexts.
  Maximum measured search/get call: 52.9 ms English / 57.4 ms German on this host.
- `bun run release:validate`: passed typecheck, **20 suites / 184 tests**, production
  webpack/ZIP, UI harness (48 modules), two-file package validation, installed
  runtime oracle, and documentation checks (16 Markdown files).
- The extractor regression now checks CSS extraction, legacy-marker invalidation,
  and reusable completion under `.complete-renderer-v2`, in addition to >2 GiB
  positional ASAR reads and media exclusion.
