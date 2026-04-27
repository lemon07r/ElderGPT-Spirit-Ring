import type { Message } from '../ai/client';
import {
  autoNameSession,
  createNewSession,
  getActiveSessionId,
  loadSession,
  saveSession,
  setActiveSessionId,
  type ChatSession,
} from './sessionManager';

export interface ChatSessionState {
  messages: Message[];
  isLoading: boolean;
  isOpen: boolean;
  unreadCount: number;
  sessionId: string;
  sessionName: string;
}

const listeners = new Set<() => void>();

const INITIAL_MESSAGES: Message[] = [
  {
    role: 'assistant',
    content:
      'Ah, junior... you have awoken me. The qi in this area is quite turbulent. How may this old master assist your cultivation today?',
  },
];

function initSession(): { id: string; name: string; messages: Message[] } {
  const activeId = getActiveSessionId();
  if (activeId) {
    const loaded = loadSession(activeId);
    if (loaded && loaded.messages.length > 0) {
      return { id: loaded.id, name: loaded.name, messages: loaded.messages };
    }
  }
  const fresh = createNewSession();
  setActiveSessionId(fresh.id);
  return { id: fresh.id, name: fresh.name, messages: [...INITIAL_MESSAGES] };
}

const initial = initSession();

let state: ChatSessionState = {
  messages: initial.messages,
  isLoading: false,
  isOpen: false,
  unreadCount: 0,
  sessionId: initial.id,
  sessionName: initial.name,
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

function persistCurrentSession() {
  const session: ChatSession = {
    id: state.sessionId,
    name: state.sessionName,
    messages: state.messages,
    createdAt: 0,
    updatedAt: Date.now(),
  };
  const existing = loadSession(state.sessionId);
  if (existing) session.createdAt = existing.createdAt;
  else session.createdAt = Date.now();
  saveSession(session);
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
  if (!trimmed) return;

  updateState((previous) => {
    const messages = [...previous.messages, { role: 'user' as const, content: trimmed }];
    const name = previous.sessionName === 'New Chat'
      ? autoNameSession(messages)
      : previous.sessionName;
    return { ...previous, messages, sessionName: name };
  });
  persistCurrentSession();
}

export function appendAssistantMessage(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return;

  updateState((previous) => ({
    ...previous,
    messages: [...previous.messages, { role: 'assistant' as const, content: trimmed }],
    unreadCount: previous.isOpen ? previous.unreadCount : previous.unreadCount + 1,
  }));
  persistCurrentSession();
}

export function startStreamingMessage() {
  updateState((previous) => ({
    ...previous,
    messages: [...previous.messages, { role: 'assistant' as const, content: '' }],
  }));
}

export function appendStreamChunk(chunk: string) {
  updateState((previous) => {
    const messages = [...previous.messages];
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      messages[messages.length - 1] = { ...last, content: last.content + chunk };
    }
    return { ...previous, messages };
  });
}

export function finalizeStreamingMessage(content: string) {
  updateState((previous) => {
    const messages = [...previous.messages];
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      messages[messages.length - 1] = { ...last, content: content.trim() || '...' };
    }
    return {
      ...previous,
      messages,
      unreadCount: previous.isOpen ? previous.unreadCount : previous.unreadCount + 1,
    };
  });
  persistCurrentSession();
}

export function replaceMessages(messages: Message[]) {
  updateState((previous) => ({ ...previous, messages }));
  persistCurrentSession();
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

export function startNewChat() {
  persistCurrentSession();
  const fresh = createNewSession();
  setActiveSessionId(fresh.id);
  state = {
    messages: [...INITIAL_MESSAGES],
    isLoading: false,
    isOpen: state.isOpen,
    unreadCount: 0,
    sessionId: fresh.id,
    sessionName: fresh.name,
  };
  emit();
}

export function switchToSession(id: string) {
  persistCurrentSession();
  const loaded = loadSession(id);
  if (!loaded) return;
  setActiveSessionId(loaded.id);
  state = {
    messages: loaded.messages.length > 0 ? loaded.messages : [...INITIAL_MESSAGES],
    isLoading: false,
    isOpen: state.isOpen,
    unreadCount: 0,
    sessionId: loaded.id,
    sessionName: loaded.name,
  };
  emit();
}

export function renameSession(name: string) {
  updateState((previous) => ({ ...previous, sessionName: name }));
  persistCurrentSession();
}

export function flushSession() {
  persistCurrentSession();
}

export function resetChatSession() {
  startNewChat();
}
