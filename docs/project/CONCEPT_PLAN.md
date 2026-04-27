---
title: Concept Plan
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-27
source_of_truth: current product direction maintained in-repo
review_cycle_days: 45
related_files: docs/project/ARCHITECTURE.md,docs/project/MODAPI_0_6_49_AUDIT.md,src/ui/components/ChatPanel.tsx
---

# Concept Plan

## Product Shape

ElderGPT Spirit Ring is a contextual advisor, not an autoplay system and not a gameplay rebalance mod. The default product contract is:

- read live game state
- present a persistent chat UI
- let the player ask questions about their current situation
- optionally surface context-aware entry points in-game

## Near-Term Priorities

1. Keep the proactive hook layer useful but deliberately narrow.
2. Improve context quality for combat, crafting, and event states without ballooning prompt size.
3. Keep the codebase small enough that future agents can safely update it against new AFNM builds.

## Concrete Next Steps

- Expand the normalized prompt payload only when it adds decision value.
- Tune official observation hooks such as `onLocationEnter`, `onAdvanceDay`, `onAdvanceMonth`, `onCompleteCrafting`, and `onCompleteCombat` based on real playtesting instead of adding more raw event coverage by default.
- Keep mutation hooks opt-in and separate from the default advisor experience.

## Anti-Goals

- Do not grow a sprawling compatibility layer before the official API is exhausted.
- Do not spread live game-shape knowledge across unrelated files.
- Do not hide stale assumptions in docs; if AFNM changes, update the docs in the same pass as the code.
