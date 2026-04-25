---
name: spirit-ring-ai-client
description: ElderGPT Spirit Ring AI client skill. Activate for OpenAI-compatible or Anthropic endpoint handling, streaming, timeout/error behavior, model limits, context compaction, secrets handling, or src/ai changes.
---

# Spirit Ring AI Client

The AI layer sends user-supplied game context and chat history to a configured endpoint. It must be resilient, private, and UI-safe.

## Activate When

- Editing `src/ai/*`, model limit detection, compaction, or token estimation
- Changing provider settings or endpoint normalization
- Debugging streaming, timeouts, or error display

## Provider Contract

- OpenAI-compatible default: normalize base URL or `/v1/chat/completions`, optional `Authorization: Bearer <key>`, `choices[0].message.content` response.
- Anthropic: normalize base URL or `/v1/messages`, use `x-api-key` and `anthropic-version`, top-level `system`, `content[].text` response.
- Support both non-streaming `chat()` and SSE streaming `chatStream()`.

## Safety Rules

- Never log API keys, request headers, or full secrets-bearing settings.
- Network failures return a short in-universe error string; do not throw into the UI.
- Respect user-configured timeouts and output limits.
- `max_tokens` is always sent for Anthropic; for OpenAI-compatible only when configured.
- Default unknown context window stays conservative (`32768`) unless model probing or user override says otherwise.

## Compaction Rules

- Trigger around 75% context usage or over 40 messages, with a minimum message count.
- Keep the last 6 messages verbatim.
- Merge into any prior summary instead of starting over.
- Insert the summary as a system message rendered as a chat divider.

## Validation

- Run unit tests for endpoint/body/response changes.
- Verify streaming and non-streaming paths when touching shared body construction.
- Keep browser compatibility; avoid tokenizer or Node-only dependencies in runtime code.

## References

- `docs/project/AI_CLIENT.md`
- `src/ai/client.ts`
- `src/ai/modelLimits.ts`
- `src/ai/compaction.ts`
- `src/ai/tokenEstimator.ts`
