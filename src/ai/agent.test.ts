import { runAgentTurn } from './agent';
import { AIClient, type Message, type ToolCall } from './client';
import { TOOL_DEFINITIONS, type ToolDependencies } from './tools';
import * as tools from './tools';

type Provider = 'openai' | 'anthropic';
const history: Message[] = [
  { role: 'system', content: 'Stable rules' },
  { role: 'user', content: 'Old question' },
  { role: 'assistant', content: 'Old answer' },
  { role: 'user', content: 'What is Rot?' },
];
const search: ToolCall = { id: 'search-1', name: 'search_game_data', arguments: '{"query":"rot","category":"buffs"}' };
const get: ToolCall = { id: 'get-2', name: 'get_game_entry', arguments: '{"category":"buffs","key":"Rot"}' };
const deps: ToolDependencies = { gameData: { buffs: { Rot: { name: 'Rot', tooltip: 'Empowers Blossom', canStack: true } as any } } };

function response(provider: Provider, streaming: boolean, text = '', calls: ToolCall[] = []): Response {
  if (!streaming) return Response.json(provider === 'openai'
    ? { choices: [{ message: { content: text, tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } }] }
    : { content: [...(text ? [{ type: 'text', text }] : []), ...calls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.arguments || '{}') }))] });
  const events: unknown[] = [];
  if (provider === 'openai') {
    if (text) events.push({ choices: [{ delta: { content: text } }] });
    // Interleaved fragmented calls: index, not arrival order, determines each call.
    calls.forEach((call, index) => events.push({ choices: [{ delta: { tool_calls: [{ index, id: call.id.slice(0, 2), function: { name: call.name.slice(0, 4), arguments: call.arguments.slice(0, 3) } }] } }] }));
    [...calls].reverse().forEach((call) => events.push({ choices: [{ delta: { tool_calls: [{ index: calls.indexOf(call), id: call.id.slice(2), function: { name: call.name.slice(4), arguments: call.arguments.slice(3) } }] } }] }));
    events.push('[DONE]');
  } else {
    if (text) events.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
    calls.forEach((call, index) => {
      events.push({ type: 'content_block_start', index: index + 1, content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} } });
      for (const partial of [call.arguments.slice(0, 3), call.arguments.slice(3)]) events.push({ type: 'content_block_delta', index: index + 1, delta: { type: 'input_json_delta', partial_json: partial } });
      events.push({ type: 'content_block_stop', index: index + 1 });
    });
    events.push({ type: 'message_stop' });
  }
  return new Response(events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''));
}

describe('bounded advisor agent', () => {
  const originalFetch = global.fetch;
  let model = 0;
  const client = (provider: Provider = 'openai', options = {}) => new AIClient({ url: 'http://agent-test', apiKey: '', provider, modelId: `agent-${model++}`, ...options });
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  test.each([['openai', false], ['openai', true], ['anthropic', false], ['anthropic', true]] as const)(
    '%s stream=%s: sequential multiple calls, one round, then answer; protocol and stable cache/state', async (provider, streaming) => {
      const fetchMock = jest.fn()
        .mockResolvedValueOnce(response(provider, streaming, 'Let me check.', [search, get]))
        .mockResolvedValueOnce(response(provider, streaming, 'Rot empowers Blossom.'));
      global.fetch = fetchMock;
      const chunks: string[] = [];
      const labels: Array<string | undefined> = [];
      const result = await runAgentTurn(client(provider), history, {
        gameLookups: true, gameState: 'HP:7', toolDependencies: deps,
        ...(streaming ? { onChunk: (chunk: string) => chunks.push(chunk) } : {}), onLookup: (label) => labels.push(label),
      });
      expect(result).toEqual({ text: 'Let me check.\n\nRot empowers Blossom.', lookups: [{ label: 'search: rot', ok: true }, { label: 'Rot (buff)', ok: true }] });
      if (streaming) expect(chunks.join('')).toBe(result.text);
      expect(labels).toEqual(['search: rot', 'search: rot', 'get_game_entry', 'Rot (buff)', undefined]);
      const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
      expect(bodies).toHaveLength(2);
      expect(bodies[1].tools).toEqual(bodies[0].tools);
      for (const body of bodies) {
        expect(JSON.stringify(body).match(/<game_state/g)).toHaveLength(1);
        expect(JSON.stringify(body.messages.find((message: any) => JSON.stringify(message.content).includes('What is Rot?')))).toContain('HP:7');
        if (provider === 'anthropic') {
          expect(body.system).toEqual(bodies[0].system);
          expect(body.tools.at(-1).cache_control).toEqual({ type: 'ephemeral' });
          expect(body.tools.slice(0, -1).every((tool: any) => !tool.cache_control)).toBe(true);
          expect(JSON.stringify(body).match(/"cache_control"/g)).toHaveLength(3);
          expect(body.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Old answer', cache_control: { type: 'ephemeral' } }] });
        }
      }
      if (provider === 'openai') {
        expect(bodies[1].messages.at(-3).tool_calls.map((call: any) => call.id)).toEqual(['search-1', 'get-2']);
        expect(bodies[1].messages.slice(-2)).toEqual([
          { role: 'tool', content: expect.stringContaining('buffs | Rot'), tool_call_id: 'search-1' },
          { role: 'tool', content: expect.stringContaining('Empowers Blossom'), tool_call_id: 'get-2' },
        ]);
        expect(bodies[0].tools.map((tool: any) => tool.function.name)).toEqual(TOOL_DEFINITIONS.map((tool) => tool.name));
      } else {
        expect(bodies[1].messages.at(-2).content.slice(1)).toEqual([
          { type: 'tool_use', id: 'search-1', name: search.name, input: JSON.parse(search.arguments) },
          { type: 'tool_use', id: 'get-2', name: get.name, input: JSON.parse(get.arguments) },
        ]);
        expect(bodies[1].messages.at(-1).content).toEqual([
          { type: 'tool_result', tool_use_id: 'search-1', content: expect.stringContaining('buffs | Rot') },
          { type: 'tool_result', tool_use_id: 'get-2', content: expect.stringContaining('Empowers Blossom') },
        ]);
      }
      expect(JSON.stringify(history)).not.toContain('game_state');
    },
  );

  test.each(['openai', 'anthropic'] as const)('%s: tool errors are fed back and invalid/empty arguments become objects', async (provider) => {
    const calls = ['', '{broken'].map((args, index) => ({ id: `bad-${index}`, name: 'search_game_data', arguments: args }));
    // Anthropic streams arguments as JSON fragments too, even malformed fragments.
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(provider, true, '', calls))
      .mockResolvedValueOnce(response(provider, true, 'Please give a query.'));
    global.fetch = fetchMock;
    const result = await runAgentTurn(client(provider), history, { gameLookups: true, onChunk: jest.fn(), toolDependencies: deps });
    expect(result.lookups).toEqual([{ label: 'search_game_data', ok: false }, { label: 'search_game_data', ok: false }]);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    if (provider === 'anthropic') {
      expect(body.messages.at(-1).content.every((block: any) => block.is_error && block.content.includes('non-blank query'))).toBe(true);
      expect(body.messages.at(-2).content.every((block: any) => JSON.stringify(block.input) === '{}')).toBe(true);
    } else expect(body.messages.slice(-2).every((message: any) => message.content.startsWith('Error: Lookup failed: Provide a non-blank query.'))).toBe(true);
  });

  test.each(['openai', 'anthropic'] as const)('%s: request eight retains definitions, forbids calls, and pins state/cache to the player', async (provider) => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response(provider, false, '', [search])));
    global.fetch = fetchMock;
    fetchMock.mockImplementationOnce(() => Promise.resolve(response(provider, false, 'Checking.', [search])));
    // The eighth request must answer, without executing any further calls.
    fetchMock.mockImplementation(async () => response(provider, false, fetchMock.mock.calls.length === 8 ? 'Final answer.' : '', [search]));
    const result = await runAgentTurn(client(provider), history, { gameLookups: true, gameState: 'HP:9', toolDependencies: deps });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.lookups).toHaveLength(7);
    expect(result.text).toBe('Checking.\n\nFinal answer.');
    const body = JSON.parse(fetchMock.mock.calls[7][1].body);
    expect(body.tools).toHaveLength(4);
    expect(body.tool_choice).toEqual(provider === 'openai' ? 'none' : { type: 'none' });
    expect(JSON.stringify(body.messages.at(-1))).toContain('Answer now with what you have.');
    expect(JSON.stringify(body.messages.at(-1))).not.toContain('game_state');
    expect(JSON.stringify(body).match(/<game_state/g)).toHaveLength(1);
    if (provider === 'anthropic') {
      expect(JSON.stringify(body).match(/"cache_control"/g)).toHaveLength(3);
      expect(body.messages[1].content[0].text).toBe('Old answer');
      expect(body.messages[1].content[0].cache_control).toBeDefined();
    }
  });

  test.each(['openai', 'anthropic'] as const)('%s: final tool-only response retries flattened without tools and still-empty becomes a non-error note', async (provider) => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response(provider, false, '', [search])));
    global.fetch = fetchMock;
    const result = await runAgentTurn(client(provider), history, { gameLookups: true, toolDependencies: deps });
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(result.text).toContain('could not form an answer');
    expect(result.error).toBeUndefined();
    expect(result.lookups).toHaveLength(7);
    const body = JSON.parse(fetchMock.mock.calls[8][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(JSON.stringify(body.messages)).not.toMatch(/tool_calls|tool_use|tool_result|tool_call_id/);
    expect(JSON.stringify(body.messages)).toContain('Record request: search_game_data');
    expect(JSON.stringify(body.messages)).toContain('Record result:');
    expect(JSON.stringify(body.messages)).toContain('buffs | Rot');
  });

  test('tools-removed final recovery can produce an answer', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response('openai', false, '', [search])));
    global.fetch = fetchMock;
    fetchMock.mockImplementation(async () => response('openai', false, fetchMock.mock.calls.length === 9 ? 'Recovered answer' : '', [search]));
    const result = await runAgentTurn(client(), history, { gameLookups: true, toolDependencies: deps });
    expect(result.text).toBe('Recovered answer');
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  test.each([['openai', 400], ['anthropic', 404], ['openai', 422]] as const)('%s: unsupported tools %s is remembered by endpoint/model with a one-time notice', async (provider, status) => {
    const options = { modelId: `unsupported-${model++}` };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Function calling / tools not supported' } }, { status }))
      .mockImplementation(() => Promise.resolve(response(provider, false, 'Tool-free answer')));
    global.fetch = fetchMock;
    const first = await runAgentTurn(client(provider, options), history, { gameLookups: true });
    expect(first.text).toBe('Tool-free answer');
    expect(first.notice).toContain('does not support lookups');
    const second = await runAgentTurn(client(provider, options), history, { gameLookups: true });
    expect(second.notice).toBeUndefined();
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((body) => !!body.tools)).toEqual([true, false, false]);
    expect(JSON.stringify(bodies)).not.toContain(first.notice);
    await runAgentTurn(client(provider), history, { gameLookups: true });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).tools).toHaveLength(4);
  });

  test.each(['Invalid model', 'invalid function schema', 'Invalid tools schema: required property missing'])('%s is surfaced without disabling tools', async (message) => {
    const modelId = `validation-${model++}`;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ error: { message } }, { status: 400 }))
      .mockResolvedValueOnce(response('openai', false, 'Next answer'));
    global.fetch = fetchMock;
    const result = await runAgentTurn(client('openai', { modelId }), history, { gameLookups: true });
    expect(result.error).toBe(true);
    expect(result.text).toContain(message);
    expect(result.notice).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await runAgentTurn(client('openai', { modelId }), history, { gameLookups: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toHaveLength(4);
  });

  test.each([
    'This LM Studio model does not support tools',
    'registry.ollama.ai/library/model does not support function calling',
    'Tools are not supported by this model',
    "Unknown field: 'tools'",
    "Unrecognized fields in request: 'tools'",
    'Extra fields not permitted: tools',
    'tool_choice is not supported',
    "create_chat_completion() got an unexpected keyword argument 'tools'",
  ])('explicit unsupported capability falls back and is remembered: %s', async (message) => {
    const modelId = `capability-${model++}`;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ error: { message } }, { status: 400 }))
      .mockImplementation(() => Promise.resolve(response('openai', false, 'Answer')));
    global.fetch = fetchMock;
    expect((await runAgentTurn(client('openai', { modelId }), history, { gameLookups: true })).notice).toBeDefined();
    await runAgentTurn(client('openai', { modelId }), history, { gameLookups: true });
    expect(fetchMock.mock.calls.map((call) => !!JSON.parse(call[1].body).tools)).toEqual([true, false, false]);
  });

  test('plain-text gateway tool_choice errors also trigger tools-removed retry', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('Unsupported tool_choice parameter', { status: 422 }))
      .mockResolvedValueOnce(response('openai', false, 'Recovered'));
    global.fetch = fetchMock;
    const result = await runAgentTurn(client(), history, { gameLookups: true });
    expect(result.text).toBe('Recovered');
    expect(result.notice).toBeDefined();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toBeUndefined();
  });

  test.each(['openai', 'anthropic'] as const)('%s: abort during the second request preserves intermediate and partial final text, stops tool execution', async (provider) => {
    const controller = new AbortController();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(provider, true, 'Checking.', [search]))
      .mockResolvedValueOnce(response(provider, true, 'Partial answer', [get]));
    global.fetch = fetchMock;
    const chunks: string[] = [];
    const result = await runAgentTurn(client(provider), history, {
      gameLookups: true, signal: controller.signal, toolDependencies: deps,
      onChunk: (chunk) => { chunks.push(chunk); if (chunk === 'Partial answer') controller.abort(); },
    });
    expect(result).toMatchObject({ text: 'Checking.\n\nPartial answer', stopped: true, lookups: [{ label: 'search: rot', ok: true }] });
    expect(chunks.join('')).toBe(result.text);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test.each(['openai', 'anthropic'] as const)('%s: premature EOF never executes collected calls', async (provider) => {
    const complete = await response(provider, true, 'Partial answer', [search]).text();
    global.fetch = jest.fn().mockResolvedValue(new Response(complete.slice(0, complete.lastIndexOf('data:'))));
    const dispatch = jest.spyOn(tools, 'runTool');
    const result = await runAgentTurn(client(provider), history, { gameLookups: true, onChunk: jest.fn(), toolDependencies: deps });
    expect(result).toMatchObject({ error: true, text: expect.stringContaining('Partial answer') });
    expect(result.text).toContain('Stream ended before a completion event');
    expect(result.lookups).toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('abort between proposed calls prevents the next execution/request', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn().mockResolvedValue(response('openai', false, 'Checking.', [search, get]));
    const result = await runAgentTurn(client(), history, { gameLookups: true, signal: controller.signal, toolDependencies: deps,
      onLookup: (label) => { if (label === 'get_game_entry') controller.abort(); },
    });
    expect(result).toMatchObject({ text: 'Checking.', stopped: true, lookups: [{ label: 'search: rot', ok: true }] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('disabled lookups and silent tool ignoring are valid ordinary answers', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response('openai', false, 'Ordinary answer')));
    global.fetch = fetchMock;
    expect(await runAgentTurn(client(), history, { gameLookups: false })).toEqual({ text: 'Ordinary answer' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools).toBeUndefined();
    expect(await runAgentTurn(client(), history, { gameLookups: true })).toEqual({ text: 'Ordinary answer' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toHaveLength(4);
  });

  test('subsequent rounds inherit transient retry and parameter fallbacks', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response('openai', false, '', [search]))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Busy' } }, { status: 503, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'max_tokens not supported' } }, { status: 400 }))
      .mockResolvedValueOnce(response('openai', false, 'Answer'));
    global.fetch = fetchMock;
    const result = await runAgentTurn(client('openai', { maxOutputTokens: 500 }), history, { gameLookups: true, toolDependencies: deps });
    expect(result.text).toBe('Answer');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies[1].messages).toEqual(bodies[3].messages);
    expect(bodies[1].max_tokens).toBe(500);
    expect(bodies[3].max_completion_tokens).toBe(500);
  });

  test.each([false, true])('subsequent rounds inherit total/idle timeout (stream=%s)', async (streaming) => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn()
        .mockResolvedValueOnce(response('openai', streaming, 'Checking.', [search]))
        .mockImplementation((_url, init) => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
      global.fetch = fetchMock;
      const pending = runAgentTurn(client('openai', { timeoutMs: 1000 }), history, {
        gameLookups: true, toolDependencies: deps, ...(streaming ? { onChunk: jest.fn() } : {}),
      });
      await jest.advanceTimersByTimeAsync(1000);
      const result = await pending;
      expect(result.error).toBe(true);
      expect(result.text).toMatch(/^Checking\.\n\n\[System:.*timed out/);
      expect(result.lookups).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
