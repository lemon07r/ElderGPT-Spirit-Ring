---
title: Release Notes 0.9.0
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-07-27
source_of_truth: package.json,src/integration,src/ai/knowledge,src/ui
review_cycle_days: 90
related_files: package.json,src/integration/contextEngine.ts,src/integration/equipmentContext.ts,src/integration/delveContext.ts
---

# ElderGPT Spirit Ring 0.9.0

- Targets AFNM `0.7.6` and `afnm-types@0.7.6`.
- Resolves equipment with `getFullItem()` and reports harmony augments.
- Adds selected harmony/state/complexity, crafting auto-use, research, and the
  real soul-shard delve run/progression shape to live context.
- Includes Core Formation altar aggregates and the research queue's
  `materialReturned` state from AFNM 0.7.6.
- Replaces stale embedded mechanics with verified 0.7.6 guidance.
- Splits context domains and chat transcript/composer/session rendering.
- Adds typecheck, context regressions, UI harness, ZIP metadata/content checks,
  and runtime-oracle coverage to the release gate.
