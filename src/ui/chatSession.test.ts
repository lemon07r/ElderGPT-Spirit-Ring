import {
  appendAssistantMessage,
  appendUserMessage,
  readChatSessionSnapshot,
  recordChatUsage,
  resetChatSession,
  setChatOpen,
  replaceMessages,
} from './chatSession';

describe('chatSession', () => {
  beforeEach(() => {
    resetChatSession();
  });

  test('keeps conversation history outside the panel lifecycle', () => {
    appendUserMessage('Junior seeks guidance.');
    appendAssistantMessage('Then still your heart and look inward.');

    const state = readChatSessionSnapshot();
    expect(state.messages).toHaveLength(3);
    expect(state.messages[1]).toEqual({ role: 'user', content: 'Junior seeks guidance.' });
    expect(state.messages[2]).toEqual({
      role: 'assistant',
      content: 'Then still your heart and look inward.',
    });
  });

  test('tracks unread assistant messages only while chat is closed', () => {
    appendAssistantMessage('A distant bell tolls.');
    expect(readChatSessionSnapshot().unreadCount).toBe(1);

    setChatOpen(true);
    expect(readChatSessionSnapshot().unreadCount).toBe(0);

    appendAssistantMessage('You have already seen this.');
    expect(readChatSessionSnapshot().unreadCount).toBe(0);

    setChatOpen(false);
    appendAssistantMessage('A hidden warning returns.');
    expect(readChatSessionSnapshot().unreadCount).toBe(1);
  });

  test('tracks latest advisor input tokens only for the active session and resets after rewinding', () => {
    const id = readChatSessionSnapshot().sessionId;
    recordChatUsage(id, { inputTokens: 1234 });
    recordChatUsage('different-session', { inputTokens: 9999 });
    recordChatUsage(id, { outputTokens: 8 });
    expect(readChatSessionSnapshot().reportedInputTokens).toBe(1234);
    recordChatUsage(id, { inputTokens: 456 });
    expect(readChatSessionSnapshot().reportedInputTokens).toBe(456);
    replaceMessages(readChatSessionSnapshot().messages);
    expect(readChatSessionSnapshot().reportedInputTokens).toBeUndefined();
    recordChatUsage(id, { inputTokens: 1234 });
    resetChatSession();
    expect(readChatSessionSnapshot().reportedInputTokens).toBeUndefined();
  });
});
