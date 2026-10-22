import { AIClient, parseToolArguments, type ChatResult, type LookupSummary, type Message, type StreamCallback } from './client';
import { buildApiMessages } from './messages';
import { runTool, TOOL_DEFINITIONS, type ToolDependencies } from './tools';

const noTools = new Set<string>();
const FINAL_NOTE = 'Answer now with what you have.';
const EMPTY_NOTE = 'The Elder could not form an answer from the records this time. Please ask a more specific question.';
const UNSUPPORTED_NOTICE = 'This endpoint/model does not support lookups. Continuing without them for this app session.';

function rejectsToolCapability(message: string): boolean {
  const capability = String.raw`\b(?:tools?|tool_choice|functions|function[ _-]calling)\b`;
  return [
    String.raw`(?:does not|doesn't|do not|cannot|can't)\s+support\s+(?:the\s+)?${capability}`,
    String.raw`${capability}['"]?\s*(?:(?:is|are)\s+)?(?:not supported|unsupported|not available)\b`,
    String.raw`unsupported\s+(?:(?:parameter|field|argument|keyword)\s*:?\s*)?['"]?${capability}`,
    String.raw`(?:unknown|unrecognized|extra)\s+(?:parameters?|fields?|arguments?)\b[^\n.;]{0,80}${capability}`,
    String.raw`unexpected\s+keyword(?:\s+argument)?\s*:?\s*['"]?${capability}`,
  ].some((pattern) => new RegExp(pattern, 'i').test(message));
}

export interface AgentOptions {
  signal?: AbortSignal;
  gameState?: string;
  gameLookups: boolean;
  onChunk?: StreamCallback;
  onLookup?: (label: string | undefined) => void;
  toolDependencies?: ToolDependencies;
}

export interface AgentResult extends ChatResult {
  lookups?: LookupSummary[];
  notice?: string;
}

/** Only this turn's protocol is flattened; persisted history remains ordinary chat. */
function flatten(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (message.role === 'tool') return { role: 'assistant', content: `Record result${message.toolError ? ' (failed)' : ''}:\n${message.content}` };
    if (message.toolCalls?.length) return {
      role: 'assistant',
      content: [message.content, ...message.toolCalls.map((call) => `Record request: ${call.name} ${call.arguments}`)].filter(Boolean).join('\n'),
    };
    return message;
  });
}

/** Send/Retry only. Eight model rounds, with one tools-removed final recovery. */
export async function runAgentTurn(client: AIClient, history: Message[], options: AgentOptions): Promise<AgentResult> {
  // Attach once, before any request-local user notes or provider tool results exist.
  const base = buildApiMessages(history, options.gameState);
  const conversation = buildApiMessages(base.filter((message) => message.role !== 'system'));
  const cacheHistoryIndex = conversation.findLastIndex((message) => message.role === 'user') - 1;
  const transcript: Message[] = [];
  const lookups: LookupSummary[] = [];
  let text = '';
  let notice: string | undefined;
  let usage: ChatResult['usage'];
  let toolsEnabled = options.gameLookups && !noTools.has(client.capabilityKey);
  const finish = (flags: Pick<ChatResult, 'error' | 'stopped'> = {}): AgentResult => ({
    text, ...flags, ...(usage ? { usage } : {}),
    ...(lookups.length ? { lookups } : {}), ...(notice ? { notice } : {}),
  });
  const append = (value: string) => {
    if (!value) return;
    const chunk = (text ? '\n\n' : '') + value;
    text += chunk;
    return chunk;
  };
  const request = async (messages: Message[], final: boolean): Promise<ChatResult> => {
    const requestWith = async (withTools: boolean) => {
      let emitted = false;
      const requestOptions = {
        signal: options.signal, allowEmpty: true, cacheHistoryIndex,
        ...(withTools ? { tools: TOOL_DEFINITIONS, ...(final ? { toolChoice: 'none' as const } : {}) } : {}),
      };
      const result = options.onChunk
        ? await client.chatStream(withTools ? messages : flatten(messages), (chunk) => {
            if (!emitted && text) options.onChunk!('\n\n');
            emitted = true;
            options.onChunk!(chunk);
          }, requestOptions)
        : await client.chat(withTools ? messages : flatten(messages), requestOptions);
      if (result.usage) usage = result.usage;
      return result;
    };
    let result = await requestWith(toolsEnabled);
    if (toolsEnabled && !options.signal?.aborted && [400, 404, 422].includes(result.apiStatus ?? 0) &&
      rejectsToolCapability(result.apiError ?? '')) {
      if (!noTools.has(client.capabilityKey)) notice = UNSUPPORTED_NOTICE;
      noTools.add(client.capabilityKey);
      toolsEnabled = false;
      result = await requestWith(false);
    }
    return result;
  };
  try {
    for (let round = 0; round < 8; round++) {
      if (options.signal?.aborted) return finish({ stopped: true });
      const final = round === 7;
      const messages = [...base, ...transcript, ...(final ? [{ role: 'user' as const, content: FINAL_NOTE }] : [])];
      let result = await request(messages, final);
      append(result.text);
      if (result.stopped || options.signal?.aborted) return finish({ stopped: true });
      if (result.error) return finish({ error: true });
      if (final && result.toolCalls?.length && !result.text.trim()) {
        // A server ignored tool_choice. No unresolved tool protocol in recovery.
        toolsEnabled = false;
        result = await request([...base, ...transcript, { role: 'assistant', content: '', toolCalls: result.toolCalls }, { role: 'user', content: FINAL_NOTE }], true);
        append(result.text);
        if (result.stopped || options.signal?.aborted) return finish({ stopped: true });
        if (result.error) return finish({ error: true });
      }
      if (final || !toolsEnabled || !result.toolCalls?.length) {
        if (!result.text.trim()) {
          const chunk = append(EMPTY_NOTE);
          if (chunk) options.onChunk?.(chunk);
        }
        return finish();
      }
      transcript.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });
      // Even when the model proposes multiple calls, never execute concurrently.
      for (const call of result.toolCalls) {
        if (options.signal?.aborted) return finish({ stopped: true });
        const args = parseToolArguments(call.arguments);
        const label = call.name === 'search_game_data' && typeof args.query === 'string' ? `search: ${args.query}` : call.name;
        options.onLookup?.(label);
        if (options.signal?.aborted) return finish({ stopped: true });
        const output = runTool(call.name, args, options.toolDependencies);
        lookups.push({ label: output.label, ok: output.ok });
        options.onLookup?.(output.label);
        transcript.push({ role: 'tool', content: output.text, toolCallId: call.id, ...(!output.ok ? { toolError: true } : {}) });
      }
    }
    return finish();
  } finally {
    options.onLookup?.(undefined);
  }
}
