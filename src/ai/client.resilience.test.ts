import { AIClient } from './client';

const messages = [{ role: 'user' as const, content: 'Guide me.' }];
const options = { url: 'http://localhost:1234', apiKey: '', timeoutMs: 30_000 };
const answer = () => Response.json({ choices: [{ message: { content: 'Answer' } }] });
const apiError = (status: number, message: string, retryAfter?: string) => Response.json(
  { error: { message } },
  { status, headers: retryAfter === undefined ? undefined : { 'Retry-After': retryAfter } },
);
const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

function streamResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel,
  });
  return {
    response: new Response(body),
    push(text: string) { controller.enqueue(new TextEncoder().encode(text)); },
    fail() { controller.error(new TypeError('Connection lost')); },
    cancel,
  };
}

describe('AIClient cancellation, idle timeout and retries', () => {
  const originalFetch = global.fetch;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each([false, true])('external abort cancels fetch (stream=%s) without retry or timeout error', async (stream) => {
    let fetchSignal!: AbortSignal;
    const fetchMock = jest.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      fetchSignal = init.signal!;
      fetchSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    global.fetch = fetchMock as typeof fetch;
    const controller = new AbortController();
    const client = new AIClient(options);
    const result = stream
      ? client.chatStream(messages, jest.fn(), controller.signal)
      : client.chat(messages, controller.signal);
    controller.abort();
    expect(fetchSignal.aborted).toBe(true);
    expect(await result).toEqual({ text: '', stopped: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('already aborted signal never starts fetch', async () => {
    global.fetch = jest.fn();
    const controller = new AbortController();
    controller.abort();
    expect(await new AIClient(options).chat(messages, controller.signal)).toEqual({ text: '', stopped: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each(['openai', 'anthropic'] as const)('redacts JSON and plain-text %s key echoes from error text and apiError', async (provider) => {
    const apiKey = 'sk-test.[literal]+secret';
    const echo = `Rejected Bearer ${apiKey}; key=${apiKey}; again ${apiKey}`;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(apiError(401, echo))
      .mockResolvedValueOnce(new Response(echo, { status: 401 }));
    global.fetch = fetchMock;
    const client = new AIClient({ ...options, apiKey, provider });
    for (const streaming of [false, true]) {
      const result = streaming ? await client.chatStream(messages, jest.fn()) : await client.chat(messages);
      expect(result).toMatchObject({ error: true, apiStatus: 401,
        apiError: 'Rejected Bearer [REDACTED]; key=[REDACTED]; again [REDACTED]',
      });
      expect(result.text).toContain(result.apiError);
      expect(JSON.stringify(result)).not.toContain(apiKey);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('abort while reading keeps partial text and cancels the reader', async () => {
    const stream = streamResponse();
    global.fetch = jest.fn().mockResolvedValue(stream.response);
    const controller = new AbortController();
    const chunks = jest.fn();
    const result = new AIClient(options).chatStream(messages, chunks, controller.signal);
    stream.push(event('Partial answer'));
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await result).toEqual({ text: 'Partial answer', stopped: true });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveBeenCalledWith('Partial answer');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('idle timeout resets on raw bytes, reasoning and keepalive events beyond the total budget', async () => {
    const stream = streamResponse();
    global.fetch = jest.fn().mockResolvedValue(stream.response);
    let signal!: AbortSignal;
    (global.fetch as jest.Mock).mockImplementation((_url, init: RequestInit) => {
      signal = init.signal!;
      return Promise.resolve(stream.response);
    });
    const result = new AIClient({ ...options, timeoutMs: 100 }).chatStream(messages, jest.fn());
    await jest.advanceTimersByTimeAsync(80);
    stream.push('data: {"choices":[{"delta":{"reasoning_content":"Thinking"}}]}\n\n');
    await jest.advanceTimersByTimeAsync(80);
    stream.push(': keepalive\n\n');
    await jest.advanceTimersByTimeAsync(80);
    stream.push('data:'); // Even an incomplete event is received data.
    await jest.advanceTimersByTimeAsync(80);
    expect(signal.aborted).toBe(false);
    stream.push(' {}\n\n' + event('Finished') + 'data: [DONE]\n\n');
    expect(await result).toEqual({ text: 'Finished' });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('idle timeout fires when the stream goes silent and never retries after bytes', async () => {
    const stream = streamResponse();
    const fetchMock = jest.fn().mockResolvedValue(stream.response);
    global.fetch = fetchMock;
    const result = new AIClient({ ...options, timeoutMs: 100 }).chatStream(messages, jest.fn());
    stream.push(event('Partial'));
    await jest.advanceTimersByTimeAsync(99);
    expect(stream.cancel).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ error: true, text: expect.stringContaining('without incoming data') });
    expect((await result).text).toContain('Partial');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stream.cancel).toHaveBeenCalled();
  });

  test.each(['openai', 'anthropic'] as const)('%s premature EOF keeps partial text but returns an error without tool calls', async (provider) => {
    const partial = provider === 'openai'
      ? [{ choices: [{ delta: { content: 'Partial', tool_calls: [{ index: 0, id: 'one', function: { name: 'save_note', arguments: '{"text":"Remember"}' } }] } }] }]
      : [
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial' } },
          { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'one', name: 'save_note', input: { text: 'Remember' } } },
          { type: 'content_block_stop', index: 1 },
        ];
    global.fetch = jest.fn().mockResolvedValue(new Response(partial.map((value) => `data: ${JSON.stringify(value)}\n\n`).join('')));
    const chunks = jest.fn();
    const result = await new AIClient({ ...options, provider }).chatStream(messages, chunks);
    expect(result).toMatchObject({ error: true, text: expect.stringContaining('Partial') });
    expect(result.text).toContain('Stream ended before a completion event');
    expect(result.toolCalls).toBeUndefined();
    expect(chunks).toHaveBeenCalledWith('Partial');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['openai', '[DONE]'],
    ['openai', { choices: [{ delta: {}, finish_reason: 'stop' }] }],
    ['anthropic', { type: 'message_stop' }],
    ['anthropic', { type: 'message_delta', delta: { stop_reason: 'end_turn' } }],
  ] as const)('%s accepts its terminal marker %j, with or without a trailing newline', async (provider, terminal) => {
    const partial = provider === 'openai' ? event('Answer')
      : 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Answer"}}\n\n';
    const end = `data: ${typeof terminal === 'string' ? terminal : JSON.stringify(terminal)}`;
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve(new Response(partial + end)));
    expect(await new AIClient({ ...options, provider }).chatStream(messages, jest.fn())).toEqual({ text: 'Answer' });
  });

  test('time to first byte expires even if headers have arrived', async () => {
    const stream = streamResponse();
    global.fetch = jest.fn().mockResolvedValue(stream.response);
    const result = new AIClient({ ...options, timeoutMs: 100 }).chatStream(messages, jest.fn());
    await jest.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ error: true, text: expect.stringContaining('timed out') });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])('400 max_tokens switches once to max_completion_tokens (stream=%s)', async (streaming) => {
    const stream = streamResponse();
    stream.push(event('Answer') + 'data: [DONE]\n\n');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(apiError(400, "Unsupported parameter: 'max_tokens'. Use max_completion_tokens."))
      .mockResolvedValueOnce(streaming ? stream.response : answer());
    global.fetch = fetchMock;
    const client = new AIClient({ ...options, maxOutputTokens: 500 });
    const result = streaming ? await client.chatStream(messages, jest.fn()) : await client.chat(messages);
    expect(result).toEqual({ text: 'Answer' });
    const [first, second] = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(first.max_tokens).toBe(500);
    expect(second.max_completion_tokens).toBe(500);
    expect(second.max_tokens).toBeUndefined();
    expect(second.temperature).toBeUndefined();
  });

  test.each([false, true])('400 temperature retries once without it (stream=%s)', async (streaming) => {
    const stream = streamResponse();
    stream.push(event('Answer') + 'data: [DONE]\n\n');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(apiError(400, "Unsupported value: 'temperature' does not support 0.7; only the default is supported."))
      .mockResolvedValueOnce(streaming ? stream.response : answer());
    global.fetch = fetchMock;
    const client = new AIClient({ ...options, temperature: 0.7 });
    const result = streaming ? await client.chatStream(messages, jest.fn()) : await client.chat(messages);
    expect(result).toEqual({ text: 'Answer' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).temperature).toBe(0.7);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).temperature).toBeUndefined();
  });

  test('compatibility fallbacks compose, but each is tried only once', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(apiError(400, 'Unsupported parameter: max_tokens'))
      .mockResolvedValueOnce(apiError(400, 'Unsupported parameter: temperature'))
      .mockResolvedValueOnce(apiError(400, 'Unsupported parameter: max_tokens'));
    global.fetch = fetchMock;
    const result = await new AIClient({ ...options, maxOutputTokens: 500, temperature: 0.7 }).chat(messages);
    expect(result.error).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test.each([429, 500, 502, 503, 504, 'network'])('retries transient %s then succeeds with short backoff', async (status) => {
    const fetchMock = jest.fn();
    if (status === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else fetchMock.mockResolvedValueOnce(apiError(status as number, 'Try again'));
    fetchMock.mockResolvedValueOnce(answer());
    global.fetch = fetchMock;
    const result = new AIClient(options).chat(messages);
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ text: 'Answer' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('retries only twice, using 1s and 3s backoff', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(apiError(503, 'Unavailable')));
    global.fetch = fetchMock;
    const result = new AIClient(options).chat(messages);
    await jest.advanceTimersByTimeAsync(3999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect((await result).error).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('retries a network failure while reading a non-streaming response body', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockRejectedValue(new TypeError('Connection reset')) })
      .mockResolvedValueOnce(answer());
    global.fetch = fetchMock;
    const result = new AIClient(options).chat(messages);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual({ text: 'Answer' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test.each(['2', new Date(Date.now() + 2000).toUTCString()])('respects short Retry-After: %s', async (header) => {
    // Freeze dates so the HTTP-date form has an exact two-second delay.
    jest.setSystemTime(new Date(Math.floor(Date.now() / 1000) * 1000));
    const retryAfter = header === '2' ? header : new Date(Date.now() + 2000).toUTCString();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(apiError(429, 'Busy', retryAfter))
      .mockResolvedValueOnce(answer());
    global.fetch = fetchMock;
    const result = new AIClient(options).chat(messages);
    await jest.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect((await result).error).toBeUndefined();
  });

  test('Retry-After does not bypass the retry cap', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(apiError(429, 'Busy', '0')));
    global.fetch = fetchMock;
    const result = new AIClient(options).chat(messages);
    await jest.advanceTimersByTimeAsync(10);
    expect((await result).error).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('ignores Retry-After longer than ten seconds', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(apiError(429, 'Busy', '11')).mockResolvedValueOnce(answer());
    global.fetch = fetchMock;
    const result = new AIClient(options).chat(messages);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual({ text: 'Answer' });
  });

  test('user abort cancels backoff before another attempt', async () => {
    const fetchMock = jest.fn().mockResolvedValue(apiError(429, 'Busy'));
    global.fetch = fetchMock;
    const controller = new AbortController();
    const result = new AIClient(options).chat(messages, controller.signal);
    await jest.advanceTimersByTimeAsync(500);
    controller.abort();
    expect(await result).toEqual({ text: '', stopped: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('retries a broken stream before any byte is received', async () => {
    const first = streamResponse();
    const second = streamResponse();
    second.push(event('Answer') + 'data: [DONE]\n\n');
    const fetchMock = jest.fn().mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    global.fetch = fetchMock;
    const result = new AIClient(options).chatStream(messages, jest.fn());
    first.fail();
    await jest.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual({ text: 'Answer' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test.each([event('Partial'), ': keepalive\n\n'])('never retries a broken stream after its first byte: %s', async (bytes) => {
    const stream = streamResponse();
    const fetchMock = jest.fn().mockResolvedValue(stream.response);
    global.fetch = fetchMock;
    const result = new AIClient(options).chatStream(messages, jest.fn());
    stream.push(bytes);
    await jest.advanceTimersByTimeAsync(0);
    stream.fail();
    expect(await result).toMatchObject({ error: true, text: expect.stringContaining('Connection lost') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
