import type { Message } from '../ai/client';

export interface ChatSessionState {
  messages: Message[];
  isLoading: boolean;
  isOpen: boolean;
  unreadCount: number;
}

const listeners = new Set<() => void>();

const INITIAL_MESSAGES: Message[] = [
  {
    role: 'assistant',
    content:
      'Ah, junior... you have awoken me. The qi in this area is quite turbulent. How may this old master assist your cultivation today?',
  },
];

let state: ChatSessionState = {
  messages: [...INITIAL_MESSAGES],
  isLoading: false,
  isOpen: false,
  unreadCount: 0,
};

function emit() {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

function updateState(updater: (previous: ChatSessionState) => ChatSessionState): ChatSessionState {
  state = updater(state);
  emit();
  return state;
}

export function readChatSessionSnapshot(): ChatSessionState {
  return state;
}

export function subscribeToChatSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function appendUserMessage(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }

  updateState((previous) => ({
    ...previous,
    messages: [...previous.messages, { role: 'user', content: trimmed }],
  }));
}

export function appendAssistantMessage(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }

  updateState((previous) => ({
    ...previous,
    messages: [...previous.messages, { role: 'assistant', content: trimmed }],
    unreadCount: previous.isOpen ? previous.unreadCount : previous.unreadCount + 1,
  }));
}

export function setChatLoading(isLoading: boolean) {
  updateState((previous) => ({
    ...previous,
    isLoading,
  }));
}

export function setChatOpen(isOpen: boolean) {
  updateState((previous) => ({
    ...previous,
    isOpen,
    unreadCount: isOpen ? 0 : previous.unreadCount,
  }));
}

export function resetChatSession() {
  state = {
    messages: [...INITIAL_MESSAGES],
    isLoading: false,
    isOpen: false,
    unreadCount: 0,
  };
  emit();
}
