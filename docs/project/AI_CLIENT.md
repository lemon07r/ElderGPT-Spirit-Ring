---
title: AI Client
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-10-22
source_of_truth: src/ai/client.ts + src/ai/agent.ts + src/ai/messages.ts + src/ai/tools.ts + src/ai/usage.ts + src/ai/compaction.ts
review_cycle_days: 30
related_files: src/ai/client.ts,src/ai/agent.ts,src/ai/messages.ts,src/ai/tools.ts,src/ai/usage.ts,src/ai/modelLimits.ts,src/ai/compaction.ts,src/ui/chatTurn.ts,src/integration/gameLookup.ts,src/config/settings.ts
---

# AI Client

The transport supports OpenAI-compatible and Anthropic endpoints. Send and Retry
use a bounded, provider-neutral advisor loop; title, compaction, and proactive
requests remain tool-free. No API key or provider is bundled.

## Supported Providers

### OpenAI-compatible (default)

- Endpoint shape: normalizes a base URL or full `/v1/chat/completions` URL into the final endpoint
- Auth: optional `Authorization: Bearer <key>` header
- Payload: `model`, `messages`, optional `temperature` and `max_tokens`
- Response text: string or text-part arrays in `choices[0].message.content`
- Tools: function definitions, assistant `tool_calls`, then `role: 'tool'`
  results with matching `tool_call_id`; errors have an `Error:` text prefix
- Streaming: SSE text plus tool deltas accumulated by index (ID/name/arguments);
  requests include `stream_options: { include_usage: true }` when supported

### Anthropic

- Endpoint shape: normalizes a base URL or full `/v1/messages` URL into the final endpoint; also handles `/anthropic`-suffixed proxy paths
- Auth: `x-api-key` header + `anthropic-version: 2023-06-01` header
- Payload: `model`, alternating non-system `messages`, top-level `system` text
  blocks, `max_tokens`, and optional `temperature`
- Tools: `input_schema` definitions, assistant `tool_use` blocks, user
  `tool_result` blocks with `tool_use_id`; failed tools carry `is_error: true`
- Streaming: `content_block_start` for tool use plus `input_json_delta` fragments;
  text remains visible through `text_delta`

## Common Behavior

- Default model fallback: `kimi-k2.5` when no model ID is configured
- Timeout: 10--999 seconds, default 30; `requestTimeoutSeconds` in settings,
  `timeoutMs` in the client
- Result: `{ text, error?, stopped?, usage?, toolCalls? }`; HTTP failures also
  expose status/error text to the loop for capability fallback, not persistence
- Constructor: legacy `(url, apiKey, modelId)` or `AIClientOptions` including
  provider, timeout, output cap, and optional temperature
- `max_tokens`: sent for Anthropic always (defaults to 4096). For OpenAI-compatible, sent only when `maxOutputTokens` is explicitly configured.

## Reliability, Stop, And Retry

- `chat()` and `chatStream()` share the request/body/retry path. Every agent
  request inherits these rules and the caller's abort signal.
- Streaming timeout measures time to first data and idle time between **bytes**,
  including thinking, SSE comments, and keepalives. It is not a total answer cap.
- Non-streaming timeout is the total request budget, including body reads,
  retries, and backoff. Stop aborts promptly; partial visible text is preserved
  with `stopped: true`, not mislabeled as a connection error.
- Retry network failures and HTTP 429/500/502/503/504 at most twice, with 1s/3s
  backoff. Honor valid `Retry-After` delays up to 10s. Do not retry a stream once
  response bytes have arrived (avoids duplicated text/tool execution).
- OpenAI HTTP 400 fallbacks: switch unsupported `max_tokens` to
  `max_completion_tokens`, omit unsupported temperature, and omit rejected
  `stream_options`, each at most once per request. Temperature is absent by
  default, leaving reasoning models' defaults intact.
- Error text is returned in-universe with `error: true`. UI Retry rewinds to the
  last player turn and runs the same Send pipeline, without duplicating it.
- Returned error text and `apiError` redact every exact occurrence of the
  configured key, including `Bearer <key>` echoes in JSON/plain-text errors.
- Streaming requires a completion marker: OpenAI `finish_reason` or `[DONE]`;
  Anthropic `message_stop` or `message_delta.delta.stop_reason`. EOF without one
  returns `error: true` while preserving partial text. Failed/stopped responses
  never return executable tool calls; the agent exits before dispatch.
- Switching sessions or starting New Chat aborts and invalidates the active turn.
  Unique turn identity gates chunks, lookup labels, compaction, final replies,
  usage, loading resets, and titles, even after switching away and back. Stop
  retains identity long enough to finalize its partial reply as stopped; a new
  Send also invalidates any pending older title.

## Bounded Lookup Loop (`src/ai/agent.ts`)

`runAgentTurn()` is called only by `src/ui/chatTurn.ts` (Send/Retry).

1. Build normalized history and attach state to the newest **player** message
   before adding any request-local protocol turns.
2. Offer four fixed, ordered tools when `gameLookups` is enabled (default true).
   Execute proposed calls sequentially via `runTool`; invalid/empty argument
   JSON becomes `{}`, so argument failures return to the model as tool errors.
3. Append assistant tool calls and tool results to an in-memory transcript.
   Stream and retain all intermediate text as well as the final answer.
4. On round eight, keep definitions for caching but send `tool_choice: 'none'`
   (Anthropic `{ type: 'none' }`) and `Answer now with what you have.`
5. If that response still makes calls without text, retry once with tools removed
   and the in-turn protocol flattened to plain text. Still-empty answers get a
   short explanatory, non-error note. No final-round calls are executed.

The eight-round bound excludes transport retries and the explicit protocol
recovery above. A tool-bearing HTTP 400/404/422 retries without tools **only**
when it explicitly rejects the capability/field: e.g. `does not support tools`,
`tools are not supported`, `tool_choice is not supported`, an unknown/unrecognized/
extra field naming tools, or an unexpected keyword argument naming tools.
Merely mentioning a function or tools (e.g. `invalid function schema`) surfaces
the error normally and does not disable future lookups. The endpoint/model is
remembered as tool-incapable for this app session, with a one-time UI-only
notice. Servers that silently ignore tools can still answer normally.

### Tools And Data Boundaries

Definitions/dispatch live in `src/ai/tools.ts`; all game-shape reads live in
`src/integration/gameLookup.ts`:

| Tool | Behavior |
| --- | --- |
| `search_game_data` | Key/display-name ranking, optional category, up to 20 matches |
| `get_game_entry` | Exact key/display-name lookup, compact authored details, partial static item sources |
| `get_player_details` | Carried/storage inventory with resolved stats, known combat/crafting techniques |
| `save_note` | Global standing preference, only on the player's explicit request |

Adding an identical trimmed, case-insensitive note succeeds with the existing
note (same ID/text/creation time), without a settings write, even at the cap.
Retry after saving a note and then failing therefore cannot duplicate it.

Every dispatcher path catches errors. Results are bounded to 8,000 characters;
entries to about 6,000. Serialization drops functions, React elements,
cycles, and presentation/media fields. Traversal uses cumulative 1,500-node,
1,500-property, and character budgets, plus depth/array limits; primitives and
skipped properties count too. Enumeration stops on exhaustion, before a bounded
`JSON.stringify`, rather than walking the entire object then truncating. Fields
retain authored enumeration order, avoiding a full sorted-key allocation. It does not
evaluate arbitrary authored functions or hidden formulas. Item sources are
non-exhaustive static listings, not proof of current stock or access. Schemas
omit `additionalProperties: false` for gateway compatibility.

## Single API Builder And Prompt Caching

`buildApiMessages()` in `src/ai/messages.ts` is the sole display-to-transport
boundary, used by transport and auxiliary requests. It drops errors (including
legacy error strings), stopped/empty replies, leading assistant greetings, and
UI-only metadata, and merges compatible consecutive roles. Request-local tool
protocol survives normalization, but is never stored in sessions.

The system prefix is persona + RULES + selected knowledge + global player notes.
For fixed inputs/settings it is byte-stable; no live state or timestamps enter
it. Live state is request-local on the newest player message, not on tool results
or the final-answer note. Title/compaction requests get neither state nor notes.

Anthropic explicit cache breakpoints:

- Last system text block.
- Last message before the newest player message, pinned for the whole turn.
- Last tool definition only (fixed order/schema/descriptions).

There are at most three explicit breakpoints, below Anthropic's four-breakpoint
limit. OpenAI-compatible providers receive no explicit cache controls. Actual
cache eligibility, lifetime, pricing, and savings depend on provider/model;
cache hints do not guarantee a hit.

## Usage (`src/ai/usage.ts`)

Parse OpenAI prompt/completion tokens and `prompt_tokens_details.cached_tokens`;
parse Anthropic input/output, cache-read, and cache-creation tokens, including
`message_start`/`message_delta` streams. Anthropic total input includes cache
reads and creation. Log only a small token-count line, never credentials.

The loop returns the latest reported usage (not a sum of billed round costs).
The session's latest advisor input count and estimated history size at that
request inform compaction; neither is persisted or overwritten by title/summary
calls. Messages appended since the report add their estimated tokens. The larger
of that adjusted report and the fresh prompt/history estimate is used, so stale
usage cannot hide a large follow-up. Missing usage falls back to estimation.

## Model Limit Detection (`src/ai/modelLimits.ts`)

Three-tier detection strategy:

1. **Dynamic API probing** -- runs on settings change. Anthropic via `GET /v1/models` (returns `max_input_tokens`, `max_tokens`). LM Studio via `GET /api/v0/models` (returns `max_context_length`). Ollama via `POST /api/show` (returns `{arch}.context_length`).
2. **Static fallback table** -- keyed by model ID with prefix matching. Covers GPT-4o/4.1/5.4, Claude 3/3.5/4, Llama 3.x, Qwen 2.5/3/3.5, Gemma 2/3, DeepSeek, Mistral, Kimi, GLM 4/5/5.1/z1.
3. **Safe defaults** -- `contextWindow: 32768`, `maxOutput: 4096`.

User settings overrides (`contextLimitTokens`, `outputLimitTokens`) always take precedence over detected values.

## Conversation Compaction (`src/ai/compaction.ts`)

Anchored iterative summarization based on Factory Droid's approach:

- **Trigger**: max(growth-adjusted reported advisor input, fresh prompt/history
  estimate) plus reserved output reaches 75% of context window, OR history reaches
  40 messages; minimum 10 normalized messages required.
- **Process**: keep last 6 messages verbatim, summarize everything before that into a structured summary with sections (Session Context, Key Advice Given, Player Decisions, Unresolved).
- **Iterative**: if a prior summary exists, merge new messages into it rather than regenerating from scratch.
- **Summary message**: inserted as a `system`-role message, rendered in the chat UI as a centered divider.
- **Compaction call**: same configured endpoint, tool-free and state-free; failed
  or stopped summaries leave history unchanged.

## Token Estimation (`src/ai/tokenEstimator.ts`)

Simple `chars / 3.5` heuristic. Used for compaction trigger checks and knowledge injection budget calculations. Intentionally avoids a tokenizer dependency for browser compatibility.

## Verification

Unit tests cover both providers/modes, streaming fragments, tool errors, step
caps/recovery, unsupported-tool memory, caching, metadata, retries, and aborts.
See [0.11.0 release notes](RELEASE_NOTES_0.11.0.md) for the real-provider smoke
matrix and remaining game-runtime limits. Mocked game data in a protocol smoke
test verifies wire format, not in-game extraction or translation.

## What Stays Out Of This Layer

The AI client should not own:

- snapshot reads
- game-state normalization
- UI state
- chat history persistence
- proactive trigger policy

Those belong in integration or UI code.
