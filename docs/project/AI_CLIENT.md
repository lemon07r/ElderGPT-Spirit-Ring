---
title: AI Client
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-11
source_of_truth: src/ai/client.ts + src/ai/modelLimits.ts + src/ai/compaction.ts + src/ai/tokenEstimator.ts
review_cycle_days: 30
related_files: src/ai/client.ts,src/ai/modelLimits.ts,src/ai/compaction.ts,src/ai/tokenEstimator.ts,src/ui/components/ChatPanel.tsx,src/integration/contextEngine.ts,src/config/settings.ts
---

# AI Client

The AI transport supports two provider modes and posts to a user-supplied endpoint, returning the first assistant message.

## Supported Providers

### OpenAI-compatible (default)

- Endpoint shape: normalizes a base URL or full `/v1/chat/completions` URL into the final endpoint
- Auth: optional `Authorization: Bearer <key>` header
- Payload: `model`, `messages`, `temperature`, optional `max_tokens`
- Response handling: string content or structured text-part arrays from `choices[0].message.content`

### Anthropic

- Endpoint shape: normalizes a base URL or full `/v1/messages` URL into the final endpoint; also handles `/anthropic`-suffixed proxy paths
- Auth: `x-api-key` header + `anthropic-version: 2023-06-01` header
- Payload: `model`, `messages` (non-system only), `system` (top-level string extracted from system messages), `max_tokens`, `temperature`
- Response handling: text-part arrays from `content[].text`

## Common Behavior

- Default model fallback: `kimi-k2.5` when no model ID is configured
- Timeout: user-configurable (10--999 seconds, default 30), stored as `requestTimeoutSeconds` in settings and passed as `timeoutMs` to the client
- Error handling: returns a short in-universe system error string instead of throwing into the UI
- Constructor: accepts either the legacy `(url, apiKey, modelId)` positional args or an `AIClientOptions` object with `url`, `apiKey`, `modelId?`, `provider?`, `timeoutMs?`, `maxOutputTokens?`
- `max_tokens`: sent for Anthropic always (defaults to 4096). For OpenAI-compatible, sent only when `maxOutputTokens` is explicitly configured.

## Streaming

Both providers support SSE streaming via `chatStream()`. The method accepts a `StreamCallback` and returns the full accumulated response. Streaming uses the same `buildBody()` path with `stream: true`.

## Model Limit Detection (`src/ai/modelLimits.ts`)

Three-tier detection strategy:

1. **Dynamic API probing** -- runs on settings change. Anthropic via `GET /v1/models` (returns `max_input_tokens`, `max_tokens`). LM Studio via `GET /api/v0/models` (returns `max_context_length`). Ollama via `POST /api/show` (returns `{arch}.context_length`).
2. **Static fallback table** -- keyed by model ID with prefix matching. Covers GPT-4o/4.1/5.4, Claude 3/3.5/4, Llama 3.x, Qwen 2.5/3, Gemma 2/3, DeepSeek, Mistral, Kimi.
3. **Safe defaults** -- `contextWindow: 4096`, `maxOutput: 4096`.

User settings overrides (`contextLimitTokens`, `outputLimitTokens`) always take precedence over detected values.

## Conversation Compaction (`src/ai/compaction.ts`)

Anchored iterative summarization based on Factory Droid's approach:

- **Trigger**: estimated token usage reaches 75% of context window, OR message count exceeds 40 (minimum 10 messages required).
- **Process**: keep last 6 messages verbatim, summarize everything before that into a structured summary with sections (Session Context, Key Advice Given, Player Decisions, Unresolved).
- **Iterative**: if a prior summary exists, merge new messages into it rather than regenerating from scratch.
- **Summary message**: inserted as a `system`-role message, rendered in the chat UI as a centered divider.
- **Compaction call**: uses the same configured AI endpoint.

## Token Estimation (`src/ai/tokenEstimator.ts`)

Simple `chars / 3.5` heuristic. Used for compaction trigger checks and knowledge injection budget calculations. Intentionally avoids a tokenizer dependency for browser compatibility.

## Prompt Contract

The caller is responsible for building:

1. Persona/system instructions (expanded per-persona blocks with behavioral guidelines)
2. Dynamic knowledge block (state-conditional, token-budgeted)
3. Human-readable formatted game context (not raw JSON)
4. Rolling chat history (with compaction when needed)

The current system prompt format is:

```text
<expanded persona instructions>

<game overview + state-conditional knowledge blocks>

=== CURRENT SITUATION ===
Player: Name (Realm - Progress)
Location: ... | Calendar: Year X, Month Y, Day Z
...

<response guidelines>
```

## What Stays Out Of This Layer

The AI client should not own:

- snapshot reads
- game-state normalization
- UI state
- chat history persistence
- proactive trigger policy

Those belong in integration or UI code.
