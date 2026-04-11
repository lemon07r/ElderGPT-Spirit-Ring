import type { ApiProvider } from '../config/settings';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_CHAT_URL = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL = 'kimi-k2.5';
const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_API_VERSION = '2023-06-01';

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
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
  } catch (_error) {
    return null;
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
}

export class AIClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly provider: ApiProvider;
  private readonly timeoutMs: number;

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
    } else {
      this.provider = urlOrOptions.provider ?? 'openai';
      this.timeoutMs = urlOrOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      this.url = normalizeChatUrl(urlOrOptions.url, this.provider);
      this.apiKey = urlOrOptions.apiKey.trim();
      this.modelId = urlOrOptions.modelId?.trim() || DEFAULT_MODEL;
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

  private buildBody(messages: Message[]): string {
    if (this.provider === 'anthropic') {
      const systemMessages = messages.filter((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');
      const systemText = systemMessages.map((m) => m.content).join('\n\n');

      const body: Record<string, unknown> = {
        model: this.modelId,
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: 4096,
        temperature: 0.7,
      };

      if (systemText) {
        body.system = systemText;
      }

      return JSON.stringify(body);
    }

    return JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.7,
    });
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

  private async fetchChat(messages: Message[]): Promise<string> {
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? globalThis.setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        signal: controller?.signal,
        body: this.buildBody(messages),
      });

      if (this.provider === 'anthropic') {
        const data = await parseResponseJson<AnthropicChatResponse>(response);
        if (!response.ok) {
          throw new Error(this.extractErrorMessage('anthropic', response, null, data));
        }
        const content = this.extractContent('anthropic', null, data);
        return content || '...';
      }

      const data = await parseResponseJson<OpenAIChatResponse>(response);
      if (!response.ok) {
        throw new Error(this.extractErrorMessage('openai', response, data, null));
      }
      const content = this.extractContent('openai', data, null);
      return content || '...';
    } finally {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  }

  async chat(messages: Message[]): Promise<string> {
    try {
      return await this.fetchChat(messages);
    } catch (error) {
      const isErrorLike = error instanceof Error ||
        (typeof error === 'object' && error !== null && 'message' in error);
      const msg = isErrorLike ? String((error as { message: string }).message) : '';
      const name = isErrorLike && 'name' in (error as object) ? String((error as { name: string }).name) : '';
      const timedOut = name === 'AbortError' || msg.includes('aborted') || msg.includes('abort');
      const timeoutSec = Math.trunc(this.timeoutMs / 1000);
      const message = timedOut
        ? `Request timed out after ${timeoutSec} seconds`
        : msg || 'Unknown error';
      console.error('[ElderGPT] AI error', error);
      return this.formatError(message);
    }
  }

  private formatError(message: string): string {
    return `[System: The heavenly connection is severed - ${message}]`;
  }
}
