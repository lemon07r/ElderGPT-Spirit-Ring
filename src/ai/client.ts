export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_CHAT_URL = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL = 'kimi-k2.5';
const REQUEST_TIMEOUT_MS = 30_000;

type ChatResponse = {
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

async function parseResponseJson(response: Response): Promise<ChatResponse | null> {
  try {
    return (await response.json()) as ChatResponse;
  } catch (_error) {
    return null;
  }
}

function getErrorMessage(response: Response, data: ChatResponse | null): string {
  const bodyMessage = data?.error?.message?.trim();
  if (bodyMessage) {
    return bodyMessage;
  }

  return `API error: ${response.status}`;
}

export function normalizeChatUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_CHAT_URL;
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';

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

export class AIClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(url: string, apiKey: string, modelId?: string) {
    this.url = normalizeChatUrl(url);
    this.apiKey = apiKey.trim();
    this.modelId = modelId?.trim() || DEFAULT_MODEL;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private buildBody(messages: Message[]): string {
    return JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.7,
    });
  }

  private async fetchChat(messages: Message[]): Promise<string> {
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        signal: controller?.signal,
        body: this.buildBody(messages),
      });

      const data = await parseResponseJson(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(response, data));
      }

      const content = readContentText(data?.choices?.[0]?.message?.content);
      return content || '...';
    } finally {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  }

  // As of AFNM 0.6.50 the game no longer sets a restrictive connect-src CSP,
  // so fetch works directly for external endpoints.  No XHR fallback needed.
  async chat(messages: Message[]): Promise<string> {
    try {
      return await this.fetchChat(messages);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      const timedOut = msg.includes('aborted') || msg.includes('abort');
      const message = timedOut
        ? `Request timed out after ${Math.trunc(REQUEST_TIMEOUT_MS / 1000)} seconds`
        : msg || 'Unknown error';
      console.error('[ElderGPT] AI error', error);
      return this.formatError(message);
    }
  }

  private formatError(message: string): string {
    return `[System: The heavenly connection is severed - ${message}]`;
  }
}
