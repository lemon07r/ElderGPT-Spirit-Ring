---
title: AI Client
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-06
source_of_truth: src/ai/client.ts + src/ui/components/ChatPanel.tsx
review_cycle_days: 30
related_files: src/ai/client.ts,src/ui/components/ChatPanel.tsx,src/integration/contextEngine.ts
---

# AI Client

The current AI transport is intentionally small. It posts an OpenAI-compatible payload to a user-supplied endpoint and returns the first assistant message.

## Current Behavior

- Endpoint shape: normalizes a base URL or full `/v1/chat/completions` URL into the final OpenAI-compatible endpoint
- Auth: optional bearer token
- Payload: `model`, `messages`, `temperature`
- Default model fallback: `kimi-k2.5` when no model ID is configured
- Response handling: string content or structured text-part arrays from `choices[0].message.content`
- Timeout: 30 seconds
- Error handling: return a short in-universe system error string instead of throwing into the UI

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

Keep transport logic provider-agnostic, but keep documentation accurate: the current code is OpenAI-compatible only. Do not document Anthropic-native or other provider-specific behavior unless the implementation actually supports it.
