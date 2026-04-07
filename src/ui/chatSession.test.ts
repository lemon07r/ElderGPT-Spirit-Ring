import {
  appendAssistantMessage,
  appendUserMessage,
  readChatSessionSnapshot,
  resetChatSession,
  setChatOpen,
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
});
