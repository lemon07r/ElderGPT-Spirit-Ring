---
title: AI Client
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-11
source_of_truth: src/ai/client.ts + src/ui/components/ChatPanel.tsx
review_cycle_days: 30
related_files: src/ai/client.ts,src/ui/components/ChatPanel.tsx,src/integration/contextEngine.ts,src/config/settings.ts
---

# AI Client

The AI transport supports two provider modes and posts to a user-supplied endpoint, returning the first assistant message.

## Supported Providers

### OpenAI-compatible (default)

- Endpoint shape: normalizes a base URL or full `/v1/chat/completions` URL into the final endpoint
- Auth: optional `Authorization: Bearer <key>` header
- Payload: `model`, `messages`, `temperature`
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
- Constructor: accepts either the legacy `(url, apiKey, modelId)` positional args or an `AIClientOptions` object with `url`, `apiKey`, `modelId?`, `provider?`, `timeoutMs?`

## What Stays Out Of This Layer

The AI client should not own:

- snapshot reads
- game-state normalization
- UI state
- chat history persistence
- proactive trigger policy

Those belong in integration or UI code.

## Prompt Contract

The caller is responsible for building:

1. Persona/system instructions
2. Normalized game context
3. Rolling chat history

The current system prompt format is:

```text
<persona instructions>

--- CURRENT GAME STATE ---
<normalized JSON>
```

## Accuracy Rule

Keep documentation accurate to the implemented provider support. Do not document provider-specific behavior unless the implementation actually supports it.
