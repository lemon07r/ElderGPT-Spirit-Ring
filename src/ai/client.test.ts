import { AIClient, normalizeChatUrl } from './client';

describe('AIClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('normalizes base URLs to chat completions endpoints', () => {
    expect(normalizeChatUrl('http://localhost:1234')).toBe('http://localhost:1234/v1/chat/completions');
    expect(normalizeChatUrl('http://localhost:1234/v1')).toBe('http://localhost:1234/v1/chat/completions');
    expect(normalizeChatUrl('http://localhost:1234/v1/chat/completions')).toBe(
      'http://localhost:1234/v1/chat/completions',
    );
  });

  test('normalizes Anthropic URLs to messages endpoints', () => {
    expect(normalizeChatUrl('https://api.anthropic.com', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(normalizeChatUrl('https://api.anthropic.com/v1/messages', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(normalizeChatUrl('https://api.minimax.io/anthropic', 'anthropic')).toBe(
      'https://api.minimax.io/anthropic/messages',
    );
  });

  test('defaults to Anthropic messages endpoint when URL is empty and provider is anthropic', () => {
    expect(normalizeChatUrl('', 'anthropic')).toBe('https://api.anthropic.com/v1/messages');
  });

  test('parses structured assistant content arrays', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                { type: 'output_text', text: 'The Dao ' },
                { type: 'output_text', text: 'flows clearly.' },
              ],
            },
          },
        ],
      }),
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new AIClient('http://localhost:1234', '', 'gpt-test');
    const response = await client.chat([{ role: 'user', content: 'Guide me.' }]);

    expect(response).toBe('The Dao flows clearly.');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  test('falls back to the default model when modelId is blank', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'The ring answers.',
            },
          },
        ],
      }),
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new AIClient('http://localhost:1234', '', '   ');
    await client.chat([{ role: 'user', content: 'Guide me.' }]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'kimi-k2.5',
          messages: [{ role: 'user', content: 'Guide me.' }],
          temperature: 0.7,
        }),
      }),
    );
  });

  test('surfaces API error bodies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Bad API key',
        },
      }),
    }) as unknown as typeof fetch;

    const client = new AIClient('http://localhost:1234', 'bad-key', 'gpt-test');
    const response = await client.chat([{ role: 'user', content: 'Guide me.' }]);

    expect(response).toContain('Bad API key');
  });

  test('uses configurable timeout from options', async () => {
    const fetchMock = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new AIClient({
      url: 'http://localhost:1234',
      apiKey: '',
      modelId: 'test',
      timeoutMs: 100,
    });

    const response = await client.chat([{ role: 'user', content: 'Guide me.' }]);
    expect(response).toContain('timed out');
  }, 10_000);

  describe('Anthropic provider', () => {
    test('sends system message as top-level parameter', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'The elder speaks.' }],
        }),
      });

      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new AIClient({
        url: 'https://api.anthropic.com',
        apiKey: 'test-key',
        modelId: 'claude-3',
        provider: 'anthropic',
      });

      const response = await client.chat([
        { role: 'system', content: 'You are an elder.' },
        { role: 'user', content: 'Guide me.' },
      ]);

      expect(response).toBe('The elder speaks.');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.system).toBe('You are an elder.');
      expect(body.messages).toEqual([{ role: 'user', content: 'Guide me.' }]);
      expect(body.max_tokens).toBe(4096);
    });

    test('uses x-api-key header and anthropic-version', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'ok' }],
        }),
      });

      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new AIClient({
        url: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        modelId: 'claude-3',
        provider: 'anthropic',
      });

      await client.chat([{ role: 'user', content: 'test' }]);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('sk-ant-test');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['Authorization']).toBeUndefined();
    });

    test('surfaces Anthropic error bodies', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
          },
        }),
      }) as unknown as typeof fetch;

      const client = new AIClient({
        url: 'https://api.anthropic.com',
        apiKey: 'bad',
        modelId: 'claude-3',
        provider: 'anthropic',
      });

      const response = await client.chat([{ role: 'user', content: 'test' }]);
      expect(response).toContain('Invalid API key');
    });
  });
});
