---
title: Release Notes 0.11.0
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: package.json,src/ai,src/ui,src/config/settings.ts,src/integration/gameLookup.ts + CLIProxy protocol smoke on 2026-10-22
review_cycle_days: 90
related_files: package.json,src/ai/agent.ts,src/ai/client.ts,src/ai/messages.ts,src/ai/tools.ts,src/ai/usage.ts,src/ui/chatTurn.ts,src/config/settings.ts,docs/assets/workshop-description.bbcode
---

# ElderGPT Spirit Ring 0.11.0

Targets **AFNM 0.7.17** with `afnm-types@0.7.17`. This release makes advice
better grounded in records, preserves player preferences, and improves long
answers and compatibility without adding gameplay automation.

## Player-Facing Changes

- **Consult the records:** tool-capable models can search authored data, get
  entry details, and expand carried/storage inventory and known techniques.
  The reply's collapsed lookup row expands to labels and marks failures.
  Lookups default on; Settings explains how to disable them for local models.
- **Player notes:** global standing preferences survive chat/session changes.
  Add/edit/delete in Settings, or explicitly ask the Elder to remember something.
  Up to 30 notes, 500 characters each; tool saving is not for inferred or
  temporary state. Notes are sent to the configured advisor endpoint.
- **Stop and Retry:** Stop aborts immediately and keeps partial visible text;
  Retry reuses Send without duplicating the player message. Failed/stopped/empty
  replies are excluded from future model-visible history. Old sessions load.
- **Long-answer reliability:** live timeout measures silence between incoming
  bytes (including thinking/keepalives), not total answer length. Non-live mode
  retains a total request budget. Transient retries/backoff are bounded.
- **Model compatibility:** optional temperature defaults to unset; unsupported
  output-token/temperature/stream-usage parameters have one-time request
  fallbacks. Rejected tools fall back to ordinary chat for that endpoint/model
  until restart, with a one-time display-only notice.
- **Caching and context:** stable persona/RULES/knowledge/notes prefixes and
  Anthropic cache hints can reduce repeated-input cost/latency when supported.
  Reported input usage informs compaction, falling back to estimates. Savings
  are provider-dependent, not guaranteed.
- Workshop description refreshed; Other Mods, collection, and template links
  retained. The owner must pass `--sync-workshop-page` to publish that copy.

## Implementation Boundaries

`src/ui/chatTurn.ts` routes Send/Retry through `src/ai/agent.ts`, with at most
eight model rounds, sequential tool execution, and a forced-answer last round.
Tool-only last replies get one tools-removed recovery using flattened text.
All intermediate visible text is kept. Title/summary/proactive calls stay
tool-free. Cancellation, retries, and parameter fallbacks apply to each request.

`src/ai/messages.ts` is the single API builder: strips UI metadata and attaches
state to the newest player message only. Assistant error/stopped/lookup/notice
metadata persists for display; raw tool protocol and state attachments do not.
Anthropic caches the last system block, pre-player history (pinned per turn),
and last fixed tool definition: at most three explicit breakpoints.

Definitions/guarded dispatch are provider-neutral in `src/ai/tools.ts`;
`src/integration/gameLookup.ts` centralizes read-only game-shape access.
Serialization drops functions/React/media/cycles, limits depth/size, and bounds
each result. Static item sources are partial, not promises of stock or access.
No gameplay actions, Steam launches, saves/loads, or reward mutations were added.

## Fresh-Review Hardening

- Configured key echoes (including `Bearer <key>`) are redacted from returned
  error text and `apiError`, for structured and plain-text gateway failures.
- Tool fallback requires an explicit unsupported capability/field phrase.
  Invalid function schemas surface normally without disabling later lookups.
- Compaction adds estimated history growth since the reported request and takes
  the larger of that adjusted report and a fresh prompt/history estimate.
- Session switches/New Chat abort and invalidate active turns. Unique tokens
  guard every asynchronous write, including stale chunks, usage, loading resets,
  and titles after A→B→A. Interrupted partial replies are stored as stopped.
- Serializer node/property/character budgets now bound traversal itself,
  including primitive-heavy flat objects; enumeration stops when exhausted.
  Authored field order replaces full sorted-key materialization.
- Premature SSE EOF returns an error with partial text and no executable calls.
  Completion accepts OpenAI `finish_reason` **or** `[DONE]`, and Anthropic
  `message_stop` **or** `message_delta.delta.stop_reason`.
- Note adds are idempotent for trimmed, case-insensitive text, returning the
  existing note successfully even at the cap; a failed turn's Retry cannot
  duplicate an already saved preference.

Targeted regressions cover all seven changes, including a 200k-property object,
both providers' interrupted/complete streams, and deliberately late callbacks,
results, and titles after session changes.

## Live Protocol Smoke (Real Providers, Synthetic Game Data)

On 2026-10-22, listed model IDs with authenticated `GET /v1/models` on the
owner's CLIProxy (`https://cliproxy.lr7.dev`). The key was read into the process
environment only, resolving the config's file reference; never printed or
written to the smoke script or output.

The scratch Bun script drove the **real AIClient and agent loop**, injecting
synthetic item/buff/technique registries and an inventory snapshot shaped like
the C1 data probes. Asked what Rot does and whether carried pills help; every
turn executed `get_game_entry` and `get_player_details`, sent both results back,
and received final text. Eight turns / sixteen HTTP 200 requests total; no
model/route was unavailable. Each streaming result exactly matched its visible
text chunks. These are protocol checks, not claims about the model's judgment.

Usage below is the loop's **latest normalized reported** input/output/cache-read
count, not summed turn billing; `—` means not reported in that final response.

| Provider / model | Mode / turn | Tools / round-trip | Final text | Input / output / cached | Fallback |
| --- | --- | --- | --- | --- | --- |
| Anthropic / `claude-sonnet-4-6` | Non-stream / 1 | 2 / yes | yes | 4815 / 130 / 1938 | none |
| Anthropic / `claude-sonnet-4-6` | Non-stream / 2 | 2 / yes | yes | 3046 / 114 / — | none |
| Anthropic / `claude-sonnet-4-6` | Stream | 2 / yes | yes | 2877 / 148 / — | none |
| OpenAI / `gpt-5.6-sol` | Non-stream | 2 / yes | yes | 2289 / 68 / 0 | none |
| OpenAI / `gpt-5.6-sol` | Stream | 2 / yes | yes | 2289 / 64 / 2176 | none |
| OpenAI / `gpt-5.6-sol` | Non-stream, Max Output 2048 | 2 / yes | yes | 2289 / 117 / 1792 | none |
| OpenAI / `gemini-3-flash` | Non-stream | 2 / yes | yes | 1953 / 47 / — | none |
| OpenAI / `gemini-3-flash` | Stream | 2 / yes | yes | 1953 / 43 / — | none |

Anthropic cache reads were also observed on the first streaming request (1938
tokens). Its second non-streaming turn was checked but did not report positive
cache reads; cache eligibility/hits/counter availability are not guaranteed.
CLIProxy accepted OpenAI temperature 0.4 and GPT `max_tokens: 2048`, so the live
smoke did **not** trigger the 400 parameter fallbacks. Unit tests cover their
rejection paths. No new wire-format bug was found; no D runtime fix/regression
test was needed. Models can still add unsupported interpretations to records.

Reusable local script: `$HOME/.local/tmp/eldergpt/protocol-smoke.ts`; requires
`ELDER_KEY` from the environment, optional `SMOKE_CASES`/`ELDER_ENDPOINT`.

After the hardening changes, reran only `claude-stream,gpt-stream` once each:
four HTTP 200 requests, two successful lookups per case, tool-result round-trip,
nonempty final text, and exact streamed/result text matches. Neither returned an
error/stopped flag or needed a fallback. Final reported input/output/cache-read:
Anthropic **2877 / 163 / not reported**; GPT-5.6-sol **2289 / 60 / 1792**. The
script again read credentials only from its environment; game data was synthetic.

## Verification And Release Artifact

Release gate: `bun run release:validate` (typecheck, Jest, production ZIP,
`bun run ui:harness:build`, package validation, installed-runtime oracle, docs
checks), plus `git diff --check`. The ZIP's manifest and
bundled metadata derive their version from `package.json`; `src/mod.ts` has no
separate hardcoded version. Confirmed artifact:
`builds/afnm-eldergpt-spirit-ring.zip`, version **0.11.0**, game version **0.7.17**.

The initial D release gate passed on 2026-10-22: **20 suites / 154 tests passed**;
`webpack 5.105.4 compiled successfully`; UI harness bundled 48 modules;
`Validated afnm-eldergpt-spirit-ring.zip (2 files)`; oracle reported installed
`0.7.17-d8ae6ce` with the listed ModAPI/UI capabilities present; 15 Markdown files
had no broken local links and passed metadata/freshness/authority checks.
Whitespace checks passed. A separate ZIP read confirmed manifest version 0.11.0,
game version 0.7.17, and the version string in the bundled metadata.

The C2 harness screenshot/expanded-label check verified the lookup row and
intermediate/final text locally; no Steam or game launch was involved.

## Known Limits

- Quest/location lookup paths and in-game translations/resolvers are verified
  only with mocked data. Source-only real-data probing could not initialize
  quest/location world dependencies. Nine other registries / eleven search/get
  pairs were probed; real shop/vault source listings remain unverified.
- Lookups require a tool-capable model. Providers may reject or silently ignore
  tools, omit usage/cache counters, or vary caching behavior. The smoke only
  covers the named models/routes through CLIProxy, not every direct provider.
- Records do not expose arbitrary hidden formulas or evaluate authored dynamic
  functions. Static sources may omit conditions or current availability; advice
  can still be wrong. Notes and lookup details are sent to the chosen endpoint.
- **No live in-game test for 0.11.0.** Provider wire tests and browser harness
  evidence do not verify game UI/controller behavior or all live data paths.
- No commit, push, tag, Workshop upload, or gameplay mutation is part of this
  release preparation; publishing remains the owner's step.

## Owner Upload Command (Not Run)

```bash
bun run workshop:upload -- --change-note "v0.11.0 - Records lookups, player notes, caching, Stop/Retry and model compatibility" --sync-workshop-page
```

The wrapper reads `docs/assets/workshop-description.bbcode` when this flag is
present (unless `--description` overrides it), uses the existing Workshop item
`3701616500`, and rebuilds by default. Without the flag it preserves live page
copy. Review the description before running; it remains below Steam's
8,000-character limit.
