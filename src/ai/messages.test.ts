import { AIClient, type Message } from './client';
import { buildApiMessages } from './messages';

const history: Message[] = [
  { role: 'system', content: 'Instructions' },
  { role: 'assistant', content: 'Greeting' },
  { role: 'system', content: '## Session Context\nPrior goals' },
  { role: 'assistant', content: 'Proactive greeting' },
  { role: 'user', content: 'Question' },
  { role: 'assistant', content: 'Failure', error: true },
  { role: 'assistant', content: '[System: Legacy error]' },
  { role: 'assistant', content: 'Legacy partial\n\n[System: The heavenly connection is severed - Timeout]' },
  { role: 'assistant', content: '   ' },
  { role: 'assistant', content: 'Partial', stopped: true },
  { role: 'user', content: 'Follow-up' },
  { role: 'assistant', content: 'Answer' },
  { role: 'assistant', content: 'More advice' },
];

describe('buildApiMessages', () => {
  test('drops leading assistants, errors, empty and stopped messages; merges roles without mutating history', () => {
    const original = JSON.stringify(history);
    expect(buildApiMessages(history)).toEqual([
      { role: 'system', content: 'Instructions\n\n## Session Context\nPrior goals' },
      { role: 'user', content: 'Question\n\nFollow-up' },
      { role: 'assistant', content: 'Answer\n\nMore advice' },
    ]);
    expect(JSON.stringify(history)).toBe(original);
  });

  test.each(['openai', 'anthropic'] as const)('all %s payloads use the builder and strip UI-only metadata', async (provider) => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], content: [{ text: 'ok' }] }),
    });
    global.fetch = fetchMock;
    try {
      await new AIClient({ url: 'http://localhost', apiKey: '', provider }).chat(history);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      if (provider === 'anthropic') {
        expect(body.system).toEqual([{ type: 'text', text: 'Instructions\n\n## Session Context\nPrior goals', cache_control: { type: 'ephemeral' } }]);
        expect(body.messages).toEqual(buildApiMessages(history).filter((message) => message.role !== 'system'));
      } else {
        expect(body.messages).toEqual(buildApiMessages(history));
      }
      expect(JSON.stringify(body)).not.toMatch(/Failure|Legacy error|Partial|Greeting|"error"|"stopped"/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Anthropic merges conversational roles after folding interleaved system messages', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: 'ok' }] }) });
    global.fetch = fetchMock;
    try {
      await new AIClient({ url: 'http://localhost', apiKey: '', provider: 'anthropic' }).chat([
        { role: 'user', content: 'One' },
        { role: 'system', content: 'Context' },
        { role: 'user', content: 'Two' },
      ]);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual([{ role: 'user', content: 'One\n\nTwo' }]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('injects state only into the newest user message, without modifying stored messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'Stable instructions' },
      { role: 'user', content: 'Old question' },
      { role: 'assistant', content: 'Old answer' },
      { role: 'user', content: 'Current question' },
    ];
    const original = JSON.stringify(messages);
    const payload = buildApiMessages(messages, 'HP:120 | Day:18');
    expect(payload.slice(0, -1)).toEqual(messages.slice(0, -1));
    expect(payload.at(-1)).toEqual({ role: 'user', content: '<game_state captured_at_send>\nHP:120 | Day:18\n</game_state>\n\nCurrent question' });
    expect(JSON.stringify(messages)).toBe(original);
    expect(buildApiMessages(messages)).toEqual(messages);
  });
});
