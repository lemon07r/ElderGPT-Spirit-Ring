import type { ApiProvider } from '../config/settings';
import { buildApiMessages } from './messages';
import { UsageTracker, type TokenUsage } from './usage';
import type { ToolDefinition } from './tools';

export type { TokenUsage } from './usage';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  error?: true;
  stopped?: true;
  lookups?: LookupSummary[];
  notice?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolError?: boolean;
}

export interface LookupSummary { label: string; ok: boolean }
export interface ToolCall { id: string; name: string; arguments: string }

export interface ChatResult {
  text: string;
  error?: true;
  stopped?: true;
  usage?: TokenUsage;
  toolCalls?: ToolCall[];
  apiStatus?: number;
  apiError?: string;
}

export interface ChatRequestOptions {
  signal?: AbortSignal;
  /** Request-local state for advisor turns only; never persisted in history. */
  gameState?: string;
  tools?: readonly ToolDefinition[];
  toolChoice?: 'none';
  cacheHistoryIndex?: number;
  allowEmpty?: boolean;
}

export function parseToolArguments(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function requestOptions(options?: AbortSignal | ChatRequestOptions): ChatRequestOptions {
  return options && 'aborted' in options ? { signal: options } : options ?? {};
}

export type StreamCallback = (chunk: string) => void;

const DEFAULT_CHAT_URL = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL = 'kimi-k2.5';
const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_API_VERSION = '2023-06-01';

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type AnthropicChatResponse = {
  content?: Array<{
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
};

function readContentText(
  content:
    | string
    | Array<{
        type?: string;
        text?: string;
      }>
    | undefined,
): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function parseResponseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    // Invalid/non-JSON API bodies have no structured error, but transport and
    // abort failures must reach the request loop rather than become "...".
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function normalizeChatUrl(url: string, provider: ApiProvider = 'openai'): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return provider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : DEFAULT_CHAT_URL;
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';

    if (provider === 'anthropic') {
      if (path.endsWith('/messages')) {
        return parsed.toString();
      }
      if (path === '/' || path === '') {
        parsed.pathname = '/v1/messages';
        return parsed.toString();
      }
      if (path.endsWith('/v1') || path.endsWith('/anthropic')) {
        parsed.pathname = `${path}/messages`;
        return parsed.toString();
      }
      return parsed.toString();
    }

    if (path.endsWith('/chat/completions')) {
      return parsed.toString();
    }
    if (path === '/' || path === '') {
      parsed.pathname = '/v1/chat/completions';
      return parsed.toString();
    }
    if (path.endsWith('/v1')) {
      parsed.pathname = `${path}/chat/completions`;
      return parsed.toString();
    }
    return parsed.toString();
  } catch (_error) {
    return trimmed;
  }
}

export interface AIClientOptions {
  url: string;
  apiKey: string;
  modelId?: string;
  provider?: ApiProvider;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number | null;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: number | null) {
    super(message);
  }
}

function retryDelay(response: Response): number | null {
  const header = response.headers?.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms >= 0 && ms <= 10_000 ? ms : null;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Request stopped', 'AbortError'));
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export class AIClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly provider: ApiProvider;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number | undefined;
  private readonly temperature: number | null;

  get capabilityKey(): string {
    return JSON.stringify([this.provider, this.url, this.modelId]);
  }

  constructor(options: AIClientOptions);
  constructor(url: string, apiKey: string, modelId?: string);
  constructor(
    urlOrOptions: string | AIClientOptions,
    apiKey?: string,
    modelId?: string,
  ) {
    if (typeof urlOrOptions === 'string') {
      this.provider = 'openai';
      this.timeoutMs = DEFAULT_TIMEOUT_MS;
      this.url = normalizeChatUrl(urlOrOptions, this.provider);
      this.apiKey = (apiKey ?? '').trim();
      this.modelId = modelId?.trim() || DEFAULT_MODEL;
      this.maxOutputTokens = undefined;
      this.temperature = null;
    } else {
      this.provider = urlOrOptions.provider ?? 'openai';
      this.timeoutMs = urlOrOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      this.url = normalizeChatUrl(urlOrOptions.url, this.provider);
      this.apiKey = urlOrOptions.apiKey.trim();
      this.modelId = urlOrOptions.modelId?.trim() || DEFAULT_MODEL;
      this.maxOutputTokens = urlOrOptions.maxOutputTokens;
      this.temperature = urlOrOptions.temperature ?? null;
    }
  }

  private buildHeaders(): Record<string, string> {
    if (this.provider === 'anthropic') {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': ANTHROPIC_API_VERSION,
      };
      if (this.apiKey) {
        headers['x-api-key'] = this.apiKey;
      }
      return headers;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private buildBody(
    history: Message[],
    stream: boolean,
    completionTokens: boolean,
    omitTemperature: boolean,
    omitStreamOptions: boolean,
    options: ChatRequestOptions,
  ): string {
    const messages = buildApiMessages(history, options.gameState);
    if (this.provider === 'anthropic') {
      const systemMessages = messages.filter((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');
      const conversation = buildApiMessages(nonSystemMessages);
      const historyIndex = options.cacheHistoryIndex ?? conversation.findLastIndex((message) => message.role === 'user') - 1;
      const cacheControl = { type: 'ephemeral' };
      const wireMessages: Array<{ role: string; content: Array<Record<string, unknown>> }> = [];
      conversation.forEach((message, index) => {
        const content: Array<Record<string, unknown>> = message.role === 'tool'
          ? [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content, ...(message.toolError ? { is_error: true } : {}) }]
          : [
              ...(message.content ? [{ type: 'text', text: message.content }] : []),
              ...(message.toolCalls ?? []).map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: parseToolArguments(call.arguments) })),
            ];
        if (index === historyIndex && content.length) content[content.length - 1].cache_control = cacheControl;
        const role = message.role === 'tool' ? 'user' : message.role;
        const last = wireMessages.at(-1);
        if (last?.role === role) last.content.push(...content);
        else wireMessages.push({ role, content });
      });

      const body: Record<string, unknown> = {
        model: this.modelId,
        messages: wireMessages.map((message) => message.content.length === 1 && message.content[0].type === 'text' && !message.content[0].cache_control
          ? { role: message.role, content: message.content[0].text } : message),
        max_tokens: this.maxOutputTokens ?? 4096,
      };

      if (this.temperature !== null && !omitTemperature) body.temperature = this.temperature;
      // Two prompt breakpoints plus the last tool: at most three total.
      if (systemMessages.length) body.system = systemMessages.map((message, index) => ({
        type: 'text', text: message.content,
        ...(index === systemMessages.length - 1 ? { cache_control: cacheControl } : {}),
      }));
      if (stream) body.stream = true;
      if (options.tools?.length) {
        body.tools = options.tools.map((tool, index) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters,
          ...(index === options.tools!.length - 1 ? { cache_control: cacheControl } : {}),
        }));
        if (options.toolChoice) body.tool_choice = { type: options.toolChoice };
      }

      return JSON.stringify(body);
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: messages.map((message) => message.role === 'tool'
        ? { role: 'tool', content: message.toolError ? `Error: ${message.content}` : message.content, tool_call_id: message.toolCallId }
        : { role: message.role, content: message.content || (message.toolCalls?.length ? null : ''),
            ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : {}),
          }),
    };
    if (this.temperature !== null && !omitTemperature) body.temperature = this.temperature;
    if (this.maxOutputTokens) {
      body[completionTokens ? 'max_completion_tokens' : 'max_tokens'] = this.maxOutputTokens;
    }
    if (stream) {
      body.stream = true;
      if (!omitStreamOptions) body.stream_options = { include_usage: true };
    }
    if (options.tools?.length) {
      body.tools = options.tools.map((tool) => ({ type: 'function', function: tool }));
      if (options.toolChoice) body.tool_choice = options.toolChoice;
    }
    return JSON.stringify(body);
  }

  private extractContent(
    provider: ApiProvider,
    openaiData: OpenAIChatResponse | null,
    anthropicData: AnthropicChatResponse | null,
  ): string {
    if (provider === 'anthropic' && anthropicData) {
      return readContentText(anthropicData.content);
    }
    if (openaiData) {
      return readContentText(openaiData.choices?.[0]?.message?.content);
    }
    return '';
  }

  private extractErrorMessage(
    provider: ApiProvider,
    response: Response,
    openaiData: OpenAIChatResponse | null,
    anthropicData: AnthropicChatResponse | null,
  ): string {
    if (provider === 'anthropic') {
      const msg = anthropicData?.error?.message?.trim();
      if (msg) return msg;
    } else {
      const msg = openaiData?.error?.message?.trim();
      if (msg) return msg;
    }
    return `API error: ${response.status}`;
  }

  async chat(messages: Message[], options?: AbortSignal | ChatRequestOptions): Promise<ChatResult> {
    return this.request(messages, undefined, requestOptions(options));
  }

  private extractStreamChunk(parsed: unknown): string {
    if (!parsed || typeof parsed !== 'object') return '';
    const obj = parsed as Record<string, unknown>;

    if (this.provider === 'anthropic') {
      if (obj.type === 'content_block_delta') {
        const delta = obj.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'text_delta') return (delta.text as string) || '';
      }
      return '';
    }

    const choices = obj.choices as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
    return (delta?.content as string) || '';
  }

  async chatStream(
    messages: Message[],
    onChunk: StreamCallback,
    options?: AbortSignal | ChatRequestOptions,
  ): Promise<ChatResult> {
    return this.request(messages, onChunk, requestOptions(options));
  }

  private async request(
    messages: Message[],
    onChunk?: StreamCallback,
    options: ChatRequestOptions = {},
  ): Promise<ChatResult> {
    const externalSignal = options.signal;
    const usage = new UsageTracker(this.provider);
    const calls = new Map<number, ToolCall>();
    const collectCalls = (event: unknown, streaming: boolean) => {
      if (!event || typeof event !== 'object') return;
      const data = event as any;
      if (this.provider === 'anthropic') {
        if (!streaming) {
          for (const [index, block] of (data.content ?? []).entries()) if (block.type === 'tool_use') {
            calls.set(index, { id: block.id ?? '', name: block.name ?? '', arguments: JSON.stringify(block.input ?? {}) });
          }
        } else if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
          const block = data.content_block;
          calls.set(data.index, { id: block.id ?? '', name: block.name ?? '', arguments: block.input && Object.keys(block.input).length ? JSON.stringify(block.input) : '' });
        } else if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
          const call = calls.get(data.index);
          if (call) call.arguments += data.delta.partial_json ?? '';
        }
      } else {
        const incoming = streaming ? data.choices?.[0]?.delta?.tool_calls : data.choices?.[0]?.message?.tool_calls;
        for (const [index, call] of (incoming ?? []).entries()) {
          const slot = streaming ? call.index ?? index : index;
          const previous = calls.get(slot) ?? { id: '', name: '', arguments: '' };
          calls.set(slot, { id: previous.id + (call.id ?? ''), name: previous.name + (call.function?.name ?? ''), arguments: previous.arguments + (call.function?.arguments ?? '') });
        }
      }
    };
    const finish = (result: ChatResult): ChatResult => {
      const reported = usage.snapshot();
      return { ...result,
        ...(result.error ? { text: this.redactError(result.text) } : {}),
        ...(result.apiError ? { apiError: this.redactError(result.apiError) } : {}),
        ...(reported ? { usage: reported } : {}),
        ...(calls.size && !result.error && !result.stopped ? { toolCalls: [...calls].sort(([a], [b]) => a - b).map(([, call]) => call) } : {}),
      };
    };
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    const resetTimeout = () => {
      globalThis.clearTimeout(timeout);
      timeout = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);
    };
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    if (externalSignal?.aborted) abort();
    const checkAbort = () => {
      if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError');
    };
    let accumulated = '';
    let receivedByte = false;
    const emit = (chunk: string) => {
      accumulated += chunk;
      onChunk?.(chunk);
    };
    let completionTokens = false;
    let omitTemperature = false;
    let omitStreamOptions = false;
    let retries = 0;
    resetTimeout();
    try {
      while (true) {
        checkAbort();
        if (onChunk) resetTimeout();
        try {
          const response = await fetch(this.url, {
            method: 'POST',
            headers: this.buildHeaders(),
            signal: controller.signal,
            body: this.buildBody(messages, Boolean(onChunk), completionTokens, omitTemperature, omitStreamOptions, options),
          });
          checkAbort();
          if (!response.ok) {
            const rawError = await response.text();
            let data: OpenAIChatResponse & AnthropicChatResponse | null = null;
            try { data = JSON.parse(rawError); } catch { /* Gateways may return plain-text errors. */ }
            throw new HttpError(
              data ? this.extractErrorMessage(this.provider, response, data, data) : rawError.trim() || `API error: ${response.status}`,
              response.status,
              retryDelay(response),
            );
          }
          if (onChunk && response.body) {
            await this.readStream(response.body, controller.signal, (bytes) => {
              if (bytes > 0) {
                receivedByte = true;
                resetTimeout();
              }
            }, emit, (event) => { usage.update(event); collectCalls(event, true); });
          } else {
            const data = await parseResponseJson<OpenAIChatResponse & AnthropicChatResponse>(response);
            checkAbort();
            usage.update(data);
            collectCalls(data, false);
            const content = this.extractContent(this.provider, data, data) || (options.allowEmpty || calls.size ? '' : '...');
            if (onChunk) emit(content);
            else accumulated = content;
          }
          checkAbort();
          return finish({ text: accumulated || (options.allowEmpty || calls.size ? '' : '...') });
        } catch (error) {
          checkAbort();
          if (receivedByte) throw error;
          if (error instanceof HttpError && error.status === 400 && this.provider === 'openai') {
            if (onChunk && /\bstream_options\b/.test(error.message) && !omitStreamOptions) {
              omitStreamOptions = true;
              continue;
            }
            const unsupported = /unsupported|not supported|does not support|not allowed|only.*default/i.test(error.message);
            if (unsupported && /\bmax_tokens\b/.test(error.message) && this.maxOutputTokens && !completionTokens) {
              completionTokens = true;
              continue;
            }
            if (unsupported && /\btemperature\b/.test(error.message) && this.temperature !== null && !omitTemperature) {
              omitTemperature = true;
              continue;
            }
          }
          const transient = !(error instanceof HttpError) || [429, 500, 502, 503, 504].includes(error.status);
          if (!transient || retries >= 2) throw error;
          const delay = error instanceof HttpError ? error.retryAfter : null;
          // Backoff is not stream inactivity; each attempt gets a fresh TTFB budget.
          if (onChunk) globalThis.clearTimeout(timeout);
          const backoff = [1000, 3000][retries++];
          await wait(delay ?? backoff, controller.signal);
          if (onChunk) resetTimeout();
        }
      }
    } catch (error) {
      if (externalSignal?.aborted && !timedOut) return finish({ text: accumulated, stopped: true });
      const reason = timedOut
        ? `Request timed out after ${this.timeoutMs / 1000} seconds${onChunk ? ' without incoming data' : ''}`
        : error instanceof Error ? error.message : 'Unknown error';
      const errorText = this.formatError(reason);
      return finish({ text: accumulated ? `${accumulated}\n\n${errorText}` : errorText, error: true,
        ...(error instanceof HttpError ? { apiStatus: error.status, apiError: error.message } : {}),
      });
    } finally {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
      const reported = usage.snapshot();
      if (reported) console.debug(`[ElderGPT] usage input=${reported.inputTokens ?? '?'} cached=${reported.cachedInputTokens ?? 0} output=${reported.outputTokens ?? '?'}`);
    }
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    onBytes: (bytes: number) => void,
    onChunk: StreamCallback,
    onEvent: (event: unknown) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder();
    let buffer = '';
    let terminal = false;
    const line = (text: string): boolean => {
      const trimmed = text.trim();
      if (!trimmed.startsWith('data:')) return false;
      const data = trimmed.slice(5).trimStart();
      if (data === '[DONE]') return this.provider === 'openai';
      let parsed: unknown;
      try { parsed = JSON.parse(data); } catch { return false; }
      onEvent(parsed);
      const obj = parsed as {
        type?: string; error?: { message?: string };
        delta?: { stop_reason?: string | null };
        choices?: Array<{ finish_reason?: string | null }>;
      } | null;
      if (obj?.error || obj?.type === 'error') throw new Error(obj.error?.message || 'Stream error');
      if (this.provider === 'anthropic') {
        if (obj?.type === 'message_stop') return true;
        if (obj?.type === 'message_delta' && obj.delta?.stop_reason) terminal = true;
      } else if (obj?.choices?.[0]?.finish_reason) terminal = true;
      const chunk = this.extractStreamChunk(parsed);
      if (chunk) onChunk(chunk);
      return false;
    };
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (signal.aborted) break;
        if (done) {
          buffer += decoder.decode();
          if (buffer && line(buffer)) return;
          if (!terminal) throw new Error('Stream ended before a completion event');
          return;
        }
        onBytes(value.byteLength);
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const text of lines) {
          if (signal.aborted || line(text)) return;
        }
      }
    } finally {
      signal.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  private redactError(message: string): string {
    // Literal replacement also covers Authorization/Bearer echoes, including
    // keys containing regex metacharacters. An empty configured key is a no-op.
    return this.apiKey ? message.split(this.apiKey).join('[REDACTED]') : message;
  }

  private formatError(message: string): string {
    return `[System: The heavenly connection is severed - ${message}]`;
  }
}
