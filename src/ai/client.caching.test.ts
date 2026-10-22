import { AIClient, type Message } from './client';

const history: Message[] = [
  { role: 'system', content: 'Stable persona and rules' },
  { role: 'user', content: 'Old question' },
  { role: 'assistant', content: 'Old answer' },
  { role: 'system', content: '## Session Context\nPrior goals' },
  { role: 'user', content: 'Current question' },
];
const options = { url: 'http://localhost', apiKey: 'private-key' };
const sse = (events: unknown[]) => new Response(events.map((event) =>
  `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''));

describe('provider caching and usage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { jest.spyOn(console, 'debug').mockImplementation(() => {}); });
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  test('Anthropic caches the last system block and the message before the newest user, never live state', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ content: [{ text: 'Answer' }] }));
    global.fetch = fetchMock;
    await new AIClient({ ...options, provider: 'anthropic' }).chat(history, { gameState: 'HP:7 | Day:24' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system).toEqual([
      { type: 'text', text: 'Stable persona and rules' },
      { type: 'text', text: '## Session Context\nPrior goals', cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.messages).toEqual([
      { role: 'user', content: 'Old question' },
      { role: 'assistant', content: [{ type: 'text', text: 'Old answer', cache_control: { type: 'ephemeral' } }] },
      { role: 'user', content: '<game_state captured_at_send>\nHP:7 | Day:24\n</game_state>\n\nCurrent question' },
    ]);
    expect((JSON.stringify(body).match(/"cache_control"/g) ?? [])).toHaveLength(2);
    expect(body.stream_options).toBeUndefined();
    expect(JSON.stringify(history)).not.toContain('game_state');
  });

  test('first Anthropic turn uses only the system breakpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ content: [{ text: 'Answer' }] }));
    global.fetch = fetchMock;
    await new AIClient({ ...options, provider: 'anthropic' }).chat([history[0], history.at(-1)!]);
    expect((fetchMock.mock.calls[0][1].body.match(/"cache_control"/g) ?? [])).toHaveLength(1);
  });

  test('OpenAI-compatible non-streaming requests add no cache parameters or stream options', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Answer' } }] }));
    global.fetch = fetchMock;
    await new AIClient(options).chat(history, { gameState: 'Current state' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body)).toEqual(['model', 'messages']);
    expect(JSON.stringify(body)).not.toMatch(/cache_control|prompt_cache_key|stream_options/);
    expect(body.messages.at(-1).content).toContain('<game_state captured_at_send>\nCurrent state');
  });

  test.each(['openai', 'anthropic'] as const)('returns %s non-streaming usage and logs one secret-free line', async (provider) => {
    const response = provider === 'anthropic'
      ? { content: [{ text: 'Answer' }], usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 400, cache_creation_input_tokens: 50 } }
      : { choices: [{ message: { content: 'Answer' } }], usage: { prompt_tokens: 550, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 400 } } };
    global.fetch = jest.fn().mockResolvedValue(Response.json(response));
    const result = await new AIClient({ ...options, provider }).chat(history);
    expect(result).toEqual({
      text: 'Answer', usage: {
        inputTokens: 550, outputTokens: 20, cachedInputTokens: 400,
        ...(provider === 'anthropic' ? { cacheCreationInputTokens: 50 } : {}),
      },
    });
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledWith('[ElderGPT] usage input=550 cached=400 output=20');
    expect(JSON.stringify((console.debug as jest.Mock).mock.calls)).not.toContain('private-key');
  });

  test('reads Anthropic message_start and cumulative message_delta usage without double counting', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sse([
      { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 200, cache_creation_input_tokens: 50 } } },
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Thinking' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Answer' } },
      { type: 'message_delta', usage: { input_tokens: 120, output_tokens: 40 } },
      { type: 'message_delta', usage: { output_tokens: 42 } },
      { type: 'message_stop' },
    ]));
    global.fetch = fetchMock;
    const chunks = jest.fn();
    const result = await new AIClient({ ...options, provider: 'anthropic' }).chatStream(history, chunks);
    expect(result).toEqual({ text: 'Answer', usage: { inputTokens: 370, outputTokens: 42, cachedInputTokens: 200, cacheCreationInputTokens: 50 } });
    expect(chunks).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveBeenCalledWith('Answer');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream_options).toBeUndefined();
    expect(console.debug).toHaveBeenCalledWith('[ElderGPT] usage input=370 cached=200 output=42');
  });

  test('requests and reads OpenAI streaming usage, including a usage-only final event', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sse([
      { choices: [{ delta: { content: 'Answer' } }], usage: null },
      { choices: [], usage: { prompt_tokens: 1000, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 800 } } },
      '[DONE]',
    ]));
    global.fetch = fetchMock;
    const result = await new AIClient(options).chatStream(history, jest.fn());
    expect(result).toEqual({ text: 'Answer', usage: { inputTokens: 1000, outputTokens: 12, cachedInputTokens: 800 } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
    expect(console.debug).toHaveBeenCalledTimes(1);
  });

  test('400 naming stream_options retries once without it', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Unrecognized request argument: stream_options' } }, { status: 400 }))
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'Answer' } }] }, '[DONE]']));
    global.fetch = fetchMock;
    expect(await new AIClient(options).chatStream(history, jest.fn())).toEqual({ text: 'Answer' });
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.stream_options).toEqual({ include_usage: true });
    expect(second).toEqual({ model: first.model, messages: first.messages, stream: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('stream_options fallback cannot loop on another 400', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(Response.json({ error: { message: 'Unsupported stream_options' } }, { status: 400 })));
    global.fetch = fetchMock;
    expect((await new AIClient(options).chatStream(history, jest.fn())).error).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
