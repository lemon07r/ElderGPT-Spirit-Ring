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
- Send/Retry use `src/ai/agent.ts` `runAgentTurn()`; proactive, title, and
  compaction calls stay tool-free. Eight model rounds; round eight retains tool
  definitions but forbids calls and adds the final-answer note. Tool-only final
  replies get one tools-removed, flattened recovery; still-empty becomes a
  non-error explanatory note. Calls execute sequentially, never concurrently.
- OpenAI uses assistant `tool_calls` / `role: tool`; Anthropic uses `tool_use` /
  user `tool_result` with `is_error` on failure. Stream fragments by call/block
  index. Keep schemas ordered and omit `additionalProperties: false`.
- Tool-bearing 400/404/422 retries tool-free only for explicit unsupported
  capability/field phrasing tied to tools/function calling/tool_choice, not an
  invalid function schema. Remember endpoint/model until restart; notice is UI-only.

## Message, Cache, And Usage Boundaries

- `src/ai/messages.ts` is the single API builder. Strip error/stopped/empty
  display history and UI metadata; preserve only request-local tool protocol.
- System prefix: persona, RULES, selected knowledge, normalized global notes.
  Attach current state only to the newest player message before adding tool
  results/final notes. Never persist state or raw tool calls/results.
- Anthropic cache hints: last system block, history immediately before newest
  player (pinned within the loop), last tool definition. At most three explicit
  breakpoints; no accumulating hints. OpenAI has no explicit cache controls.
- `usage.ts` parses both modes/providers, including cached input. Latest advisor
  input usage feeds same-session compaction, not billing totals; title/summary
  usage must not overwrite it. Cache hits/counters are provider-dependent.

## Safety Rules

- Never log API keys, request headers, or full secrets-bearing settings.
- Redact exact configured-key echoes (including Bearer) from returned error text
  and apiError. Premature SSE EOF is an error preserving partial text, never an
  executable tool response. Accept OpenAI finish_reason or [DONE]; Anthropic
  message_stop or message_delta stop_reason.
- Network failures return a short in-universe error string; do not throw into the UI.
- Results carry optional error/stopped flags. Stop preserves partial text and
  aborts the loop, including retries/backoff. UI Retry reuses Send without
  duplicating the player message.
- Respect user-configured timeouts and output limits.
- Streaming is byte-idle timeout (thinking/keepalives reset it); non-streaming
  is total request timeout. Retry network/429/500/502/503/504 at most twice
  (1s/3s, valid Retry-After up to 10s), never after stream bytes arrive.
- OpenAI 400 fallbacks switch unsupported max_tokens to max_completion_tokens,
  omit unsupported temperature, or omit rejected stream_options, once each.
  Default temperature is unset, not a forced sampling value.
- `max_tokens` is always sent for Anthropic; for OpenAI-compatible only when configured.
- Default unknown context window stays conservative (`32768`) unless model probing or user override says otherwise.

## Compaction Rules

- Trigger at 75% context usage or 40 normalized messages, minimum 10 messages.
  Use max(reported input + estimated history growth since that request, fresh
  prompt/history estimate) + output reserve; estimate alone if usage is absent.
- Keep the last 6 messages verbatim.
- Merge into any prior summary instead of starting over.
- Insert the summary as a system message rendered as a chat divider.

## Validation

- Run unit tests for endpoint/body/response changes.
- Verify streaming and non-streaming paths when touching shared body construction.
- Real wire smoke evidence is recorded in `docs/project/RELEASE_NOTES_0.11.0.md`;
  mocked game data in that smoke does not verify live game translation/extraction.
- Keep browser compatibility; avoid tokenizer or Node-only dependencies in runtime code.

## References

- `docs/project/AI_CLIENT.md`
- `src/ai/client.ts`
- `src/ai/modelLimits.ts`
- `src/ai/compaction.ts`
- `src/ai/tokenEstimator.ts`
