import { AIClient, type Message } from './client';
import { compactConversation, estimateContextUsage, isSummaryMessage, needsCompaction } from './compaction';
import { estimateMessagesTokens } from './tokenEstimator';

describe('compaction message hygiene', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test('recognizes a summary with a short preamble', () => {
    expect(isSummaryMessage({ role: 'system', content: 'Here is the summary:\n\n## Session Context\nGoals' })).toBe(true);
    expect(isSummaryMessage({ role: 'user', content: '## Session Context' })).toBe(false);
  });

  test('merges an existing summary and excludes display-only history from summarization', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '## Session Context\nMerged goals' } }] }));
    global.fetch = fetchMock;
    const messages: Message[] = [
      { role: 'system', content: 'Summary follows:\n## Session Context\nPrior goals' },
      { role: 'assistant', content: 'Greeting' },
      { role: 'user', content: 'Current question' },
      { role: 'assistant', content: 'Failed', error: true },
      { role: 'assistant', content: 'Partial', stopped: true },
      { role: 'assistant', content: '' },
      ...Array.from({ length: 6 }, (_, index): Message => ({ role: index % 2 ? 'assistant' : 'user', content: `Recent ${index}` })),
    ];
    const result = await compactConversation(messages, new AIClient('http://localhost', ''));
    expect(result.compacted).toBe(true);
    expect(result.messages.slice(1)).toEqual(messages.slice(-6));
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content;
    expect(prompt).toContain('existing conversation summary');
    expect(prompt).toContain('Prior goals');
    expect(prompt).toContain('Current question');
    expect(prompt).not.toMatch(/Failed|Partial|Greeting/);
  });

  test('failed summaries leave the original history unchanged', async () => {
    global.fetch = jest.fn().mockResolvedValue(Response.json({ error: { message: 'Bad key' } }, { status: 401 }));
    const messages = Array.from({ length: 10 }, (_, index): Message => ({ role: index % 2 ? 'assistant' : 'user', content: `Message ${index}` }));
    expect(await compactConversation(messages, new AIClient('http://localhost', ''))).toEqual({ messages, compacted: false });
  });

  test('uses the larger of reported input and fresh character estimates, falling back when absent', () => {
    const messages = Array.from({ length: 10 }, (_, index): Message => ({ role: index % 2 ? 'assistant' : 'user', content: 'Short' }));
    expect(needsCompaction(10, messages, 1000, 100)).toBe(false);
    expect(needsCompaction(10, messages, 1000, 100, 700)).toBe(true);
    expect(needsCompaction(10_000, messages, 1000, 100, 200)).toBe(true);
    expect(estimateContextUsage(10_000, messages, 100, 200)).toBe(10_000 + estimateMessagesTokens(messages) + 100);
    expect(estimateContextUsage(10_000, messages, 100, 0)).toBe(10_000 + estimateMessagesTokens(messages) + 100);
    expect(needsCompaction(10_000, messages, 1000, 100, NaN)).toBe(true);
  });

  test('large follow-up after a reported request triggers compaction, including reported prompt overhead', () => {
    const messages = Array.from({ length: 10 }, (_, index): Message => ({ role: index % 2 ? 'assistant' : 'user', content: 'Short' }));
    const baseline = estimateMessagesTokens(messages);
    expect(needsCompaction(10, messages, 10_000, 100, 6000, baseline)).toBe(false);
    const followUp = [...messages, { role: 'user' as const, content: 'x'.repeat(7000) }];
    expect(needsCompaction(10, followUp, 10_000, 100)).toBe(false);
    expect(needsCompaction(10, followUp, 10_000, 100, 6000, baseline)).toBe(true);
    // Even legacy usage without a baseline cannot hide a huge new message.
    followUp[10].content = 'x'.repeat(28_000);
    expect(needsCompaction(10, followUp, 10_000, 100, 200)).toBe(true);
  });
});
