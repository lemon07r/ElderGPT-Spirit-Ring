import type { Message, TokenUsage } from '../ai/client';
import { buildApiMessages, isErrorMessage } from '../ai/messages';
import { estimateMessagesTokens } from '../ai/tokenEstimator';
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
  reportedInputTokens?: number;
  reportedHistoryTokens?: number;
  lookupLabel?: string;
}

const listeners = new Set<() => void>();
let activeTurn: { token: symbol; controller: AbortController; detach: () => void } | undefined;

function abortActiveTurn() {
  const turn = activeTurn;
  activeTurn = undefined;
  if (!turn) return;
  turn.detach();
  turn.controller.abort();
  // Preserve interrupted visible text as stopped, not as a completed answer.
  if (state.isLoading && state.messages.at(-1)?.role === 'assistant') {
    finalizeStreamingMessage(state.messages.at(-1)!.content, { stopped: true });
  }
}

/** Identity lasts through best-effort title generation, until replaced/aborted. */
export function beginChatTurn(externalSignal?: AbortSignal) {
  abortActiveTurn();
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  if (externalSignal?.aborted) abort();
  const token = Symbol('chat turn');
  const sessionId = state.sessionId;
  activeTurn = { token, controller, detach: () => externalSignal?.removeEventListener('abort', abort) };
  return { signal: controller.signal, isCurrent: () => activeTurn?.token === token && state.sessionId === sessionId };
}

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

type MessageMetadata = Pick<Message, 'error' | 'stopped' | 'lookups' | 'notice'>;

export function appendAssistantMessage(content: string, metadata: MessageMetadata = {}) {
  const trimmed = content.trim();
  if (!trimmed) return;

  updateState((previous) => ({
    ...previous,
    messages: [...previous.messages, { role: 'assistant' as const, content: trimmed, ...metadata }],
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

export function finalizeStreamingMessage(content: string, metadata: MessageMetadata = {}) {
  updateState((previous) => {
    const messages = [...previous.messages];
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      if (content.trim()) {
        messages[messages.length - 1] = { ...last, content: content.trim(), ...metadata };
      } else {
        messages.pop();
      }
    }
    return {
      ...previous,
      messages,
      unreadCount: previous.isOpen || !content.trim() ? previous.unreadCount : previous.unreadCount + 1,
    };
  });
  persistCurrentSession();
}

/** Rewind a trailing failed reply to its last user turn, without duplicating that turn. */
export function prepareRetryLastUserTurn(): boolean {
  const last = state.messages.at(-1);
  if (state.isLoading || !last || !isErrorMessage(last)) return false;
  const userIndex = state.messages.findLastIndex((message) => message.role === 'user' && message.content.trim());
  if (userIndex < 0) return false;
  replaceMessages(state.messages.slice(0, userIndex + 1));
  return true;
}

export function replaceMessages(messages: Message[]) {
  updateState((previous) => ({ ...previous, messages, reportedInputTokens: undefined, reportedHistoryTokens: undefined }));
  persistCurrentSession();
}

/** Only full advisor-turn usage belongs here, not title/summary/synthetic prompt usage. */
export function recordChatUsage(sessionId: string, usage?: TokenUsage, requestMessages: Message[] = state.messages) {
  const input = usage?.inputTokens;
  if (sessionId !== state.sessionId || input === undefined || !Number.isFinite(input) || input < 0) return;
  updateState((previous) => ({ ...previous, reportedInputTokens: input,
    reportedHistoryTokens: estimateMessagesTokens(buildApiMessages(requestMessages)),
  }));
}

export function setChatLoading(isLoading: boolean) {
  updateState((previous) => ({
    ...previous,
    isLoading,
    ...(!isLoading ? { lookupLabel: undefined } : {}),
  }));
}

export function setLookupLabel(lookupLabel: string | undefined) {
  updateState((previous) => ({ ...previous, lookupLabel }));
}

export function setChatOpen(isOpen: boolean) {
  updateState((previous) => ({
    ...previous,
    isOpen,
    unreadCount: isOpen ? 0 : previous.unreadCount,
  }));
}

export function startNewChat() {
  abortActiveTurn();
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
  abortActiveTurn();
  persistCurrentSession();
  // A same-session reload must include the just-finalized stopped placeholder.
  const target = loadSession(id) ?? loaded;
  setActiveSessionId(target.id);
  state = {
    messages: target.messages.length > 0 ? target.messages : [...INITIAL_MESSAGES],
    isLoading: false,
    isOpen: state.isOpen,
    unreadCount: 0,
    sessionId: target.id,
    sessionName: target.name,
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
