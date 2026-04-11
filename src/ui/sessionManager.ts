import type { Message } from '../ai/client';

export interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = 'eldergpt_sessions';
const ACTIVE_SESSION_KEY = 'eldergpt_active_session';
const MAX_SESSIONS = 20;
const MOD_TAG = '[ElderGPT]';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadSessionIndex(): Array<{ id: string; name: string; createdAt: number; updatedAt: number }> {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessionIndex(index: Array<{ id: string; name: string; createdAt: number; updatedAt: number }>) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(index));
  } catch (e) {
    console.warn(`${MOD_TAG} Failed to save session index`, e);
  }
}

function loadSessionMessages(id: string): Message[] {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(`eldergpt_session_${id}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessionMessages(id: string, messages: Message[]) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(`eldergpt_session_${id}`, JSON.stringify(messages));
  } catch (e) {
    console.warn(`${MOD_TAG} Failed to save session messages`, e);
  }
}

function deleteSessionMessages(id: string) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(`eldergpt_session_${id}`);
  } catch { /* ignored */ }
}

export function autoNameSession(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user');
  if (!firstUserMsg) return 'New Chat';
  const text = firstUserMsg.content.trim();
  if (text.length <= 50) return text;
  return text.slice(0, 47) + '...';
}

export function listSessions(): Array<{ id: string; name: string; createdAt: number; updatedAt: number }> {
  return loadSessionIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadSession(id: string): ChatSession | null {
  const index = loadSessionIndex();
  const entry = index.find((s) => s.id === id);
  if (!entry) return null;
  const messages = loadSessionMessages(id);
  return { ...entry, messages };
}

export function saveSession(session: ChatSession) {
  const index = loadSessionIndex();
  const existing = index.findIndex((s) => s.id === session.id);
  const entry = {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };

  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.unshift(entry);
  }

  while (index.length > MAX_SESSIONS) {
    const removed = index.pop();
    if (removed) deleteSessionMessages(removed.id);
  }

  saveSessionIndex(index);
  saveSessionMessages(session.id, session.messages);
}

export function deleteSession(id: string) {
  const index = loadSessionIndex().filter((s) => s.id !== id);
  saveSessionIndex(index);
  deleteSessionMessages(id);
}

export function createNewSession(): ChatSession {
  return {
    id: generateId(),
    name: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function getActiveSessionId(): string | null {
  if (!canUseLocalStorage()) return null;
  return window.localStorage.getItem(ACTIVE_SESSION_KEY) || null;
}

export function setActiveSessionId(id: string) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } catch { /* ignored */ }
}
