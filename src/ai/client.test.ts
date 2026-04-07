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
});
