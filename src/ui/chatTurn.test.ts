import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildApiMessages } from '../ai/messages';
import * as agent from '../ai/agent';
import { AIClient } from '../ai/client';
import { DEFAULT_SETTINGS, readSettingsSnapshot, updateSettings } from '../config/settings';
import { extractContext, formatGameState, getSystemPrompt } from '../integration/contextEngine';
import {
  appendAssistantMessage,
  appendStreamChunk,
  appendUserMessage,
  finalizeStreamingMessage,
  readChatSessionSnapshot,
  recordChatUsage,
  resetChatSession,
  startStreamingMessage,
  startNewChat,
  switchToSession,
} from './chatSession';
import { sendChatTurn } from './chatTurn';
import { ChatTranscript } from './components/ChatTranscript';
import { loadSession, saveSession } from './sessionManager';

function installStorage() {
  const store = new Map<string, string>();
  (global as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
}

const liveMessage = (text: string) => `<game_state captured_at_send>\n${formatGameState(extractContext(null))}\n</game_state>\n\n${text}`;

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('chat turn pipeline and display metadata', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    installStorage();
    resetChatSession();
    updateSettings({ ...DEFAULT_SETTINGS, autoTitle: false, showStreaming: false });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete (global as any).window;
    jest.restoreAllMocks();
  });

  test.each([false, true])('Retry re-sends the last user turn through the same pipeline (stream=%s)', async (streaming) => {
    updateSettings({ showStreaming: streaming });
    const success = streaming
      ? new Response('data: {"choices":[{"delta":{"content":"Restored answer"}}]}\n\ndata: [DONE]\n\n')
      : Response.json({ choices: [{ message: { content: 'Restored answer' } }] });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Bad key' } }, { status: 401 }))
      .mockResolvedValueOnce(success);
    global.fetch = fetchMock;
    await sendChatTurn('Where should I cultivate?');
    const failed = readChatSessionSnapshot();
    expect(failed.messages.at(-1)).toMatchObject({ role: 'assistant', error: true });
    expect(loadSession(failed.sessionId)?.messages.at(-1)?.error).toBe(true);

    // This is the same no-prompt call made by the transcript's Retry button.
    await sendChatTurn();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody).toEqual(firstBody);
    expect(retryBody.messages.at(-1)).toEqual({ role: 'user', content: liveMessage('Where should I cultivate?') });
    const recovered = readChatSessionSnapshot();
    expect(recovered.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(recovered.messages.some((message) => message.error)).toBe(false);
    expect(recovered.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Restored answer' });
    expect(recovered.isLoading).toBe(false);
  });

  test('Retry is a no-op without a trailing error', async () => {
    global.fetch = jest.fn();
    appendUserMessage('Question');
    appendAssistantMessage('Answer');
    await sendChatTurn();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(readChatSessionSnapshot().messages.at(-1)?.content).toBe('Answer');
  });

  test('Retry after saving a note and then failing does not duplicate the saved note', async () => {
    const toolReply = (text: string) => Response.json({ choices: [{ message: { content: '', tool_calls: [
      { id: 'save', type: 'function', function: { name: 'save_note', arguments: JSON.stringify({ text }) } },
    ] } }] });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(toolReply('Prefer safe progression.'))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Bad key' } }, { status: 401 }))
      .mockResolvedValueOnce(toolReply('  PREFER SAFE PROGRESSION.  '))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'Remembered.' } }] }));
    global.fetch = fetchMock;
    await sendChatTurn('Remember that I prefer safe progression.');
    expect(readChatSessionSnapshot().messages.at(-1)?.error).toBe(true);
    const saved = readSettingsSnapshot().memoryNotes[0];
    await sendChatTurn();
    expect(readSettingsSnapshot().memoryNotes).toEqual([saved]);
    expect(readChatSessionSnapshot().messages.at(-1)).toMatchObject({ content: 'Remembered.', lookups: [{ label: 'Memory note saved', ok: true }] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).messages.at(-1).content).toBe('Remembered: Prefer safe progression.');
  });

  test('Retry after a failed proactive reply still ends the payload at the last user turn', async () => {
    appendUserMessage('Question');
    appendAssistantMessage('Earlier answer');
    appendAssistantMessage('Failed proactive reply', { error: true });
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Retried answer' } }] }));
    global.fetch = fetchMock;
    await sendChatTurn();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages.at(-1)).toEqual({ role: 'user', content: liveMessage('Question') });
    expect(readChatSessionSnapshot().messages.at(-1)?.content).toBe('Retried answer');
  });

  test('abort before text removes the streaming placeholder and persists no empty assistant', async () => {
    updateSettings({ showStreaming: true });
    global.fetch = jest.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
    }));
    const controller = new AbortController();
    const pending = sendChatTurn('Question', controller.signal);
    expect(readChatSessionSnapshot().messages.at(-1)?.content).toBe('');
    controller.abort();
    await pending;
    const state = readChatSessionSnapshot();
    expect(state.messages.at(-1)).toEqual({ role: 'user', content: 'Question' });
    expect(loadSession(state.sessionId)?.messages.some((message) => !message.content.trim())).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test.each([false, true])('A→B→A rejects stale chunks, labels, usage, final writes and finally (stream=%s)', async (streaming) => {
    updateSettings({ showStreaming: streaming });
    const old = deferred<agent.AgentResult>();
    const fresh = deferred<agent.AgentResult>();
    const run = jest.spyOn(agent, 'runAgentTurn')
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => fresh.promise);
    const a = readChatSessionSnapshot().sessionId;
    const pendingOld = sendChatTurn('Old question');
    const oldOptions = run.mock.calls[0][2];
    oldOptions.onChunk?.('Old partial');
    saveSession({ id: 'b', name: 'B', messages: [], createdAt: 1, updatedAt: 1 });
    switchToSession('b');
    expect(oldOptions.signal?.aborted).toBe(true);
    switchToSession(a);
    const pendingFresh = sendChatTurn('New question');
    const freshOptions = run.mock.calls[1][2];
    freshOptions.onChunk?.('Fresh partial');
    freshOptions.onLookup?.('Fresh lookup');
    const before = readChatSessionSnapshot();
    // Deliberately misbehaving callbacks/results arrive despite cancellation.
    oldOptions.onChunk?.('STALE chunk');
    oldOptions.onLookup?.('STALE lookup');
    old.resolve({ text: 'STALE final', usage: { inputTokens: 9999 }, lookups: [{ label: 'STALE', ok: true }] });
    await pendingOld;
    expect(readChatSessionSnapshot()).toEqual(before);
    expect(readChatSessionSnapshot().isLoading).toBe(true);
    expect(readChatSessionSnapshot().lookupLabel).toBe('Fresh lookup');
    fresh.resolve({ text: 'Fresh answer', usage: { inputTokens: 123 } });
    await pendingFresh;
    expect(readChatSessionSnapshot()).toMatchObject({ isLoading: false, reportedInputTokens: 123 });
    expect(readChatSessionSnapshot().messages.at(-1)?.content).toBe('Fresh answer');
    expect(JSON.stringify(loadSession(a))).not.toContain('STALE');
  });

  test('A→B→A rejects a stale title while a new turn is loading', async () => {
    updateSettings({ autoTitle: true });
    const title = deferred<{ text: string }>();
    const fresh = deferred<agent.AgentResult>();
    const titleRequest = jest.spyOn(AIClient.prototype, 'chat').mockImplementation(() => title.promise);
    jest.spyOn(agent, 'runAgentTurn')
      .mockResolvedValueOnce({ text: 'Old answer' })
      .mockImplementationOnce(() => fresh.promise);
    const a = readChatSessionSnapshot().sessionId;
    await sendChatTurn('Old question');
    expect(titleRequest).toHaveBeenCalledTimes(1);
    const titleSignal = titleRequest.mock.calls[0][1] as AbortSignal;
    saveSession({ id: 'b', name: 'B', messages: [], createdAt: 1, updatedAt: 1 });
    switchToSession('b');
    switchToSession(a);
    const pendingFresh = sendChatTurn('New question');
    expect(titleSignal.aborted).toBe(true);
    const before = readChatSessionSnapshot();
    title.resolve({ text: 'STALE title' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(readChatSessionSnapshot()).toEqual(before);
    fresh.resolve({ text: 'Fresh answer' });
    await pendingFresh;
    expect(loadSession(a)?.name).toBe('Old question');
  });

  test('New Chat aborts and invalidates the active turn', async () => {
    const old = deferred<agent.AgentResult>();
    const run = jest.spyOn(agent, 'runAgentTurn').mockImplementation(() => old.promise);
    const pending = sendChatTurn('Question');
    startNewChat();
    const before = readChatSessionSnapshot();
    expect(run.mock.calls[0][2].signal?.aborted).toBe(true);
    old.resolve({ text: 'STALE' });
    await pending;
    expect(readChatSessionSnapshot()).toEqual(before);
  });

  test('partial stopped replies and error metadata survive persistence but never reach the model', () => {
    appendUserMessage('Question');
    startStreamingMessage();
    appendStreamChunk('Partial');
    finalizeStreamingMessage('Partial', { stopped: true });
    appendAssistantMessage('Connection error', { error: true });
    const state = readChatSessionSnapshot();
    switchToSession(state.sessionId);
    expect(readChatSessionSnapshot().messages.slice(-2)).toEqual([
      { role: 'assistant', content: 'Partial', stopped: true },
      { role: 'assistant', content: 'Connection error', error: true },
    ]);
    expect(buildApiMessages(readChatSessionSnapshot().messages)).toEqual([{ role: 'user', content: 'Question' }]);
  });

  test('old sessions still load, including legacy errors and empty placeholders', () => {
    saveSession({
      id: 'old-session', name: 'Old', createdAt: 1, updatedAt: 2,
      messages: [
        { role: 'assistant', content: 'Greeting' },
        { role: 'user', content: 'Old question' },
        { role: 'assistant', content: '[System: Old error]' },
        { role: 'assistant', content: '' },
      ],
    });
    switchToSession('old-session');
    const state = readChatSessionSnapshot();
    expect(state.messages).toHaveLength(4);
    expect(buildApiMessages(state.messages)).toEqual([{ role: 'user', content: 'Old question' }]);
  });

  test('transcript labels stopped text and offers Retry only on the last error', () => {
    const props = { persona: 'Elder', fontSize: 14, showLoading: false, listRef: React.createRef<HTMLDivElement>(), onRetry: jest.fn() };
    const messages = [
      { role: 'assistant' as const, content: 'Partial', stopped: true as const },
      { role: 'assistant' as const, content: 'Failed', error: true as const },
    ];
    const html = renderToStaticMarkup(React.createElement(ChatTranscript, { ...props, messages }));
    expect(html).toContain('(stopped)');
    expect(html).toContain('Connection error:');
    expect(html).toMatch(/<button[^>]*>Retry<\/button>/);
    const later = renderToStaticMarkup(React.createElement(ChatTranscript, {
      ...props, messages: [...messages, { role: 'user', content: 'New question' }],
    }));
    expect(later).not.toContain('>Retry<');
  });

  test('title generation filters display-only history and leaves an error title unused', async () => {
    updateSettings({ autoTitle: true, memoryNotes: [{ id: 'note', text: 'Unmentioned standing preference', createdAt: 1 }] });
    appendAssistantMessage('Earlier failure', { error: true });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'Answer' } }] }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'Bad key' } }, { status: 401 }));
    global.fetch = fetchMock;
    await sendChatTurn('A title-worthy question');
    // Title requests are best effort and run after the turn, without blocking it.
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const titleBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(titleBody.messages[1].content).toBe('user: A title-worthy question\nassistant: Answer');
    expect(JSON.stringify(titleBody)).not.toMatch(/game_state|=== GAME STATE ===|Unmentioned standing preference/);
    expect(readChatSessionSnapshot().sessionName).toBe('A title-worthy question');
  });

  test('state is request-local; compaction and persistence never receive it or unrelated memory notes', async () => {
    updateSettings({ contextLimitTokens: 10_000, memoryNotes: [{ id: 'note', text: 'Unmentioned standing preference', createdAt: 1 }] });
    for (let i = 0; i < 6; i++) {
      appendUserMessage(`Question ${i}`);
      appendAssistantMessage(`Answer ${i}`);
    }
    recordChatUsage(readChatSessionSnapshot().sessionId, { inputTokens: 100_000 });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '## Session Context\nPrior goals' } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'Current answer' } }], usage: { prompt_tokens: 800, completion_tokens: 12 } }));
    global.fetch = fetchMock;
    await sendChatTurn('Current question');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const summaryBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(summaryBody)).not.toMatch(/game_state|=== GAME STATE ===|Unmentioned standing preference/);
    const chatBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(chatBody.messages[0].content).toContain('Unmentioned standing preference');
    expect(chatBody.messages.filter((message: { content: string }) => message.content.includes('<game_state'))).toHaveLength(1);
    expect(chatBody.messages.at(-1).content).toBe(liveMessage('Current question'));
    const state = readChatSessionSnapshot();
    expect(state.reportedInputTokens).toBe(800);
    expect(JSON.stringify(state.messages)).not.toMatch(/game_state|=== GAME STATE ===|Unmentioned standing preference/);
    expect(JSON.stringify(loadSession(state.sessionId))).not.toMatch(/game_state|=== GAME STATE ===|Unmentioned standing preference|reportedInputTokens/);
  });

  test.each([false, true])('Send persists lookup labels, not protocol; stripped on the next turn (stream=%s)', async (streaming) => {
    updateSettings({ showStreaming: streaming });
    const toolCall = { id: 'one', type: 'function', function: { name: 'search_game_data', arguments: '{"query":"rot"}' } };
    const responses = [
      { content: 'Checking.', tool_calls: [{ index: 0, ...toolCall }] },
      { content: 'The answer.' },
      { content: 'Next answer.' },
    ];
    const fetchMock = jest.fn().mockImplementation(() => {
      const reply = responses.shift();
      return Promise.resolve(streaming
        ? new Response(`data: ${JSON.stringify({ choices: [{ delta: reply }] })}\n\ndata: [DONE]\n\n`)
        : Response.json({ choices: [{ message: reply }] }));
    });
    global.fetch = fetchMock;
    await sendChatTurn('Look up Rot');
    const state = readChatSessionSnapshot();
    expect(state.messages.at(-1)).toMatchObject({ content: 'Checking.\n\nThe answer.', lookups: [{ label: 'search: rot', ok: true }] });
    expect(JSON.stringify(state.messages)).not.toMatch(/toolCalls|toolCallId|role":"tool/);
    expect(state.lookupLabel).toBeUndefined();
    switchToSession(state.sessionId);
    expect(readChatSessionSnapshot().messages.at(-1)?.lookups).toEqual([{ label: 'search: rot', ok: true }]);
    await sendChatTurn('What next?');
    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(JSON.stringify(body.messages)).not.toMatch(/lookups|notice|search: rot|tool_calls|tool_call_id/);
    expect(body.messages[0].content).toBe(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content);
  });

  test('lookup setting selects stable rules and disables tools; titles stay tool-free', async () => {
    updateSettings({ gameLookups: false, autoTitle: true });
    const disabledPrompt = getSystemPrompt('Elder', '');
    expect(disabledPrompt).toContain('You CANNOT see: unequipped item stats');
    expect(disabledPrompt).not.toContain('Use lookup tools');
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(Response.json({ choices: [{ message: { content: 'Answer' } }] })));
    global.fetch = fetchMock;
    await sendChatTurn('Question');
    await new Promise((resolve) => setImmediate(resolve));
    await sendChatTurn('Another question');
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.every((body) => !body.tools)).toBe(true);
    expect(bodies[0].messages[0].content).toBe(bodies[2].messages[0].content);
    updateSettings({ gameLookups: true });
    const enabledPrompt = getSystemPrompt('Elder', '');
    expect(enabledPrompt).toContain('Use lookup tools');
    expect(enabledPrompt).not.toContain('You CANNOT see: unequipped item stats');
    expect(getSystemPrompt('Elder', '')).toBe(enabledPrompt);
  });

  test('lookup row is collapsed, marks failures, and shows only display metadata', () => {
    const html = renderToStaticMarkup(React.createElement(ChatTranscript, {
      persona: 'Elder', fontSize: 14, showLoading: true, lookupLabel: 'search: rot', listRef: React.createRef<HTMLDivElement>(),
      messages: [{ role: 'assistant', content: 'Answer.', lookups: [{ label: 'search: rot', ok: true }, { label: 'Missing entry', ok: false }], notice: 'Local models may not support lookups.' }],
    }));
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain('Consulted the records (2)');
    expect(html).toContain('Missing entry (failed)');
    expect(html).toContain('Consulting the records: search: rot');
    expect(html).toContain('Local models may not support lookups.');
    expect(html.indexOf('Consulted the records')).toBeLessThan(html.indexOf('Answer.'));
    expect(buildApiMessages([{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Answer', lookups: [{ label: 'Private label', ok: false }], notice: 'Private notice' }])).toEqual([
      { role: 'user', content: 'Question' }, { role: 'assistant', content: 'Answer' },
    ]);
  });
});
