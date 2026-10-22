import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  FONT_SIZES,
  PANEL_DIMENSIONS,
  loadPanelPosition,
  readSettingsSnapshot,
  savePanelPosition,
  subscribeToSettings,
  updateSettings,
} from '../../config/settings';
import {
  extractContext,
} from '../../integration/contextEngine';
import {
  readGameStateSnapshot,
  subscribeToGameState,
} from '../../integration/gameState';
import { type Corner, getClosestCorner } from '../../utils/dragUtils';
import { useDraggable } from '../../utils/useDraggable';
import {
  flushSession,
  readChatSessionSnapshot,
  startNewChat,
  subscribeToChatSession,
  switchToSession,
} from '../chatSession';
import { sendChatTurn } from '../chatTurn';
import {
  isTextEntryElement,
  pasteClipboardIntoElement,
} from '../inputShortcuts';
import { deleteSession, listSessions } from '../sessionManager';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript } from './ChatTranscript';
import { SessionControls, type SessionListEntry } from './SessionControls';
import { SettingsPanel } from './SettingsPanel';

interface Props {
  corner: Corner;
  setCorner: (corner: Corner) => void;
  onClose: () => void;
}

const PANEL_MARGIN = 20;
type ConnectionStatus = 'live' | 'partial' | 'offline';

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  live: '#4ade80',
  partial: '#facc15',
  offline: '#f87171',
};

function connectionStatus(source: string): ConnectionStatus {
  if (source === 'modapi-snapshot') return 'live';
  if (source === 'redux-store') return 'partial';
  return 'offline';
}

function cornerToPosition(
  corner: Corner,
  width: number,
  height: number,
): { x: number; y: number } {
  const right = window.innerWidth - width - PANEL_MARGIN;
  const bottom = window.innerHeight - height - PANEL_MARGIN;
  switch (corner) {
    case 'top-left': return { x: PANEL_MARGIN, y: PANEL_MARGIN };
    case 'top-right': return { x: right, y: PANEL_MARGIN };
    case 'bottom-left': return { x: PANEL_MARGIN, y: bottom };
    case 'bottom-right': return { x: right, y: bottom };
  }
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

export function ChatPanel({ corner, setCorner, onClose }: Props) {
  const dragRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [savedPosition, setSavedPosition] = useState(loadPanelPosition);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [input, setInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);

  const settings = useSyncExternalStore(
    subscribeToSettings,
    readSettingsSnapshot,
    readSettingsSnapshot,
  );
  const chatState = useSyncExternalStore(
    subscribeToChatSession,
    readChatSessionSnapshot,
    readChatSessionSnapshot,
  );
  const snapshot = useSyncExternalStore(
    subscribeToGameState,
    readGameStateSnapshot,
    readGameStateSnapshot,
  );
  const context = useMemo(() => extractContext(snapshot), [snapshot]);
  const dim = PANEL_DIMENSIONS[settings.panelSize];
  const fontSize = FONT_SIZES[settings.fontSize];

  const handleDragEnd = (position: { x: number; y: number }) => {
    setSavedPosition(position);
    savePanelPosition(position);
    setCorner(
      getClosestCorner(
        position.x + dim.width / 2,
        position.y + dim.height / 2,
      ),
    );
  };
  const drag = useDraggable(setCorner, dragRef, handleDragEnd);

  const refreshSessions = useCallback(() => {
    flushSession();
    setSessions(listSessions());
  }, []);

  useEffect(() => {
    if (showSessions) refreshSessions();
  }, [
    showSessions,
    chatState.sessionId,
    chatState.sessionName,
    refreshSessions,
  ]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = globalThis.setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => globalThis.clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    const streaming =
      chatState.isLoading &&
      chatState.messages.at(-1)?.role === 'assistant';
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: streaming ? 'auto' : 'smooth',
    });
  }, [chatState.messages, chatState.isLoading]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const active = document.activeElement;
      if (
        !dragRef.current?.contains(active) ||
        !isTextEntryElement(active)
      ) return;
      event.stopPropagation();
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void pasteClipboardIntoElement(active);
      }
    };
    window.addEventListener('keydown', handleShortcut, true);
    return () => window.removeEventListener('keydown', handleShortcut, true);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        !dragRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body
      ) return;
      if (showSettings) setShowSettings(false);
      else if (showSessions) setShowSessions(false);
      else onClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [showSettings, showSessions, onClose]);

  const runTurn = async (prompt?: string) => {
    if (readChatSessionSnapshot().isLoading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await sendChatTurn(prompt, controller.signal);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleSend = () => {
    const prompt = input.trim();
    if (!prompt || readChatSessionSnapshot().isLoading) return;
    setInput('');
    void runTurn(prompt);
  };

  const handleDelete = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const active = id === chatState.sessionId;
    deleteSession(id);
    setConfirmDeleteId(null);
    if (active) {
      const remaining = listSessions();
      if (remaining.length > 0) switchToSession(remaining[0].id);
      else startNewChat();
    }
    refreshSessions();
  };

  const defaultPosition = cornerToPosition(corner, dim.width, dim.height);
  const position = drag.dragPos ??
    (savedPosition
      ? {
          x: Math.max(
            0,
            Math.min(savedPosition.x, window.innerWidth - 100),
          ),
          y: Math.max(
            0,
            Math.min(savedPosition.y, window.innerHeight - 50),
          ),
        }
      : defaultPosition);
  const status = connectionStatus(context.source);
  const isStreamingWithContent =
    settings.showStreaming &&
    chatState.isLoading &&
    chatState.messages.at(-1)?.role === 'assistant' &&
    Boolean(chatState.messages.at(-1)?.content);

  return (
    <div
      ref={dragRef}
      role="dialog"
      aria-label="Spirit Ring Chat"
      aria-modal="true"
      onKeyDown={stop}
      onKeyUp={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
      onCopy={stop}
      onCut={stop}
      onPaste={stop}
      onContextMenu={stop}
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        top: position.y,
        left: position.x,
        width: dim.width,
        height: dim.height,
        backgroundColor: 'rgba(15, 15, 20, 0.95)',
        border: '1px solid #C5A059',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        color: '#ddd',
        fontFamily: 'sans-serif',
        fontSize,
        overflow: 'hidden',
        cursor: drag.isDragging ? 'grabbing' : 'default',
      }}
    >
      <div
        style={{
          padding: '10px 15px',
          borderBottom: '1px solid rgba(197,160,89,.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: drag.isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ color: '#C5A059' }}>Spirit Ring</strong>
          <span
            title={`Game data: ${status}`}
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              marginLeft: 6,
              backgroundColor: STATUS_COLORS[status],
            }}
          />
          <div style={{ color: '#b9b0a0', fontSize: 11 }}>
            {context.status} · {context.location}
          </div>
        </div>
        <div>
          <button
            type="button"
            aria-label="Chat history"
            style={headerButtonStyle}
            onClick={() => {
              setShowSessions(!showSessions);
              setShowSettings(false);
            }}
          >
            ☰
          </button>
          <button
            type="button"
            aria-label="New chat"
            style={headerButtonStyle}
            onClick={() => {
              startNewChat();
              setShowSessions(false);
            }}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Open settings"
            style={headerButtonStyle}
            onClick={() => {
              setShowSettings(!showSettings);
              setShowSessions(false);
            }}
          >
            ⚙
          </button>
          <button
            type="button"
            aria-label="Minimize Spirit Ring"
            style={headerButtonStyle}
            onClick={onClose}
          >
            ✖
          </button>
        </div>
      </div>

      {showSessions ? (
        <SessionControls
          sessions={sessions}
          activeId={chatState.sessionId}
          confirmDeleteId={confirmDeleteId}
          onSwitch={(id) => switchToSession(id)}
          onDelete={handleDelete}
          onNew={() => {
            startNewChat();
            setShowSessions(false);
          }}
          onBack={() => setShowSessions(false)}
        />
      ) : showSettings ? (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          settings={settings}
          setSettings={updateSettings}
        />
      ) : (
        <>
          {chatState.sessionName !== 'New Chat' && (
            <div style={{ padding: '4px 15px', color: '#a69d8c', fontSize: 11 }}>
              {chatState.sessionName}
            </div>
          )}
          <ChatTranscript
            messages={chatState.messages}
            persona={settings.persona}
            fontSize={fontSize}
            showLoading={chatState.isLoading && (!isStreamingWithContent || !!chatState.lookupLabel)}
            listRef={messageListRef}
            onRetry={() => void runTurn()}
            isLoading={chatState.isLoading}
            lookupLabel={chatState.lookupLabel}
          />
          <ChatComposer
            input={input}
            setInput={setInput}
            isLoading={chatState.isLoading}
            fontSize={fontSize}
            textareaRef={textareaRef}
            onSend={() => void handleSend()}
            onAbort={() => abortRef.current?.abort()}
          />
        </>
      )}
    </div>
  );
}

const headerButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#aaa',
  cursor: 'pointer',
  fontSize: '16px',
  padding: '2px 4px',
};
