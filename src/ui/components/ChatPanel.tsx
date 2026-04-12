import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AIClient, Message } from '../../ai/client';
import { needsCompaction, compactConversation } from '../../ai/compaction';
import { selectKnowledge } from '../../ai/knowledge';
import { detectModelLimits, getStaticModelLimits } from '../../ai/modelLimits';
import { estimateTokens } from '../../ai/tokenEstimator';
import {
  FONT_SIZES,
  PANEL_DIMENSIONS,
  loadPanelPosition,
  savePanelPosition,
  readSettingsSnapshot,
  subscribeToSettings,
  updateSettings,
} from '../../config/settings';
import { extractContext, getSystemPrompt } from '../../integration/contextEngine';
import { readGameStateSnapshot, subscribeToGameState } from '../../integration/gameState';
import {
  appendAssistantMessage,
  appendUserMessage,
  readChatSessionSnapshot,
  renameSession,
  replaceMessages,
  setChatLoading,
  startNewChat,
  switchToSession,
  startStreamingMessage,
  appendStreamChunk,
  finalizeStreamingMessage,
  subscribeToChatSession,
} from '../chatSession';
import { listSessions, deleteSession } from '../sessionManager';
import { useDraggable } from '../../utils/useDraggable';
import { getClosestCorner, Corner } from '../../utils/dragUtils';
import { isTextEntryElement, pasteClipboardIntoElement } from '../inputShortcuts';
import { SettingsPanel } from './SettingsPanel';
import { MarkdownText } from './MarkdownText';
import { LoadingAnimation } from './LoadingAnimation';

interface Props {
  corner: Corner;
  setCorner: (corner: Corner) => void;
  onClose: () => void;
}

const PANEL_MARGIN = 20;
const KNOWLEDGE_TOKEN_BUDGET_RATIO = 0.30;
const OUTPUT_RESERVE_TOKENS = 2048;

function cornerToPosition(c: Corner, width: number, height: number): { x: number; y: number } {
  switch (c) {
    case 'top-right': return { x: window.innerWidth - width - PANEL_MARGIN, y: PANEL_MARGIN };
    case 'top-left': return { x: PANEL_MARGIN, y: PANEL_MARGIN };
    case 'bottom-right': return { x: window.innerWidth - width - PANEL_MARGIN, y: window.innerHeight - height - PANEL_MARGIN };
    case 'bottom-left': return { x: PANEL_MARGIN, y: window.innerHeight - height - PANEL_MARGIN };
  }
}

type ConnectionStatus = 'live' | 'partial' | 'offline';

function getConnectionStatus(source: string): ConnectionStatus {
  if (source === 'modapi-snapshot') return 'live';
  if (source === 'redux-store') return 'partial';
  return 'offline';
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  live: '#4ade80',
  partial: '#facc15',
  offline: '#f87171',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  live: 'Live',
  partial: 'Partial',
  offline: 'Offline',
};

export function ChatPanel({ corner, setCorner, onClose }: Props) {
  const dragRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [savedPosition, setSavedPosition] = useState<{ x: number; y: number } | null>(() => loadPanelPosition());

  const handleDragEnd = (pos: { x: number; y: number }) => {
    setSavedPosition(pos);
    savePanelPosition(pos);
    const s = readSettingsSnapshot();
    const d = PANEL_DIMENSIONS[s.panelSize];
    setCorner(getClosestCorner(pos.x + d.width / 2, pos.y + d.height / 2));
  };

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, dragPos, isDragging } = useDraggable(setCorner, dragRef, handleDragEnd);

  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [input, setInput] = useState('');
  const settings = useSyncExternalStore(subscribeToSettings, readSettingsSnapshot, readSettingsSnapshot);
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
  const context = extractContext(snapshot);
  const { messages, isLoading, sessionName } = chatState;
  const dim = PANEL_DIMENSIONS[settings.panelSize];
  const fontSize = FONT_SIZES[settings.fontSize];

  const getPositionStyles = (): React.CSSProperties => {
    if (dragPos) return { top: dragPos.y, left: dragPos.x };
    if (savedPosition) return {
      top: Math.max(0, Math.min(savedPosition.y, window.innerHeight - 50)),
      left: Math.max(0, Math.min(savedPosition.x, window.innerWidth - 100)),
    };
    const pos = cornerToPosition(corner, dim.width, dim.height);
    return { top: pos.y, left: pos.x };
  };

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleTextShortcut = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const activeElement = document.activeElement;
      if (!dragRef.current?.contains(activeElement) || !isTextEntryElement(activeElement)) return;
      event.stopPropagation();
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void pasteClipboardIntoElement(activeElement);
      }
    };

    window.addEventListener('keydown', handleTextShortcut, true);
    return () => window.removeEventListener('keydown', handleTextShortcut, true);
  }, []);

  const generateSessionTitle = async (client: AIClient) => {
    const snap = readChatSessionSnapshot();
    const convo = snap.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, 4)
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');
    try {
      const title = await client.chat([
        { role: 'system', content: 'Generate a concise chat title (max 6 words) for this conversation. Reply with ONLY the title, no quotes, no punctuation at the end, no explanation.' },
        { role: 'user', content: convo },
      ]);
      const cleaned = title.trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '').slice(0, 60);
      if (cleaned && !cleaned.startsWith('[System:')) {
        renameSession(cleaned);
      }
    } catch { /* title generation is best-effort */ }
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const currentMessages = [...readChatSessionSnapshot().messages, userMessage];
    appendUserMessage(trimmedInput);
    setInput('');
    setChatLoading(true);

    const contextWindow = settings.contextLimitTokens
      ?? getStaticModelLimits(settings.modelId).contextWindow;
    const outputReserve = settings.outputLimitTokens ?? OUTPUT_RESERVE_TOKENS;

    const knowledgeBudget = Math.floor(contextWindow * KNOWLEDGE_TOKEN_BUDGET_RATIO);
    const knowledgeBlock = selectKnowledge(context, knowledgeBudget);
    const systemContent = getSystemPrompt(settings.persona, settings.customPrompt, context, knowledgeBlock);
    const systemTokens = estimateTokens(systemContent);

    const client = new AIClient({
      url: settings.apiUrl,
      apiKey: settings.apiKey,
      modelId: settings.modelId,
      provider: settings.provider,
      timeoutMs: settings.requestTimeoutSeconds * 1000,
      maxOutputTokens: settings.outputLimitTokens ?? undefined,
    });

    let chatMessages = currentMessages;

    if (needsCompaction(systemTokens, chatMessages, contextWindow, outputReserve)) {
      const result = await compactConversation(chatMessages, client);
      if (result.compacted) {
        chatMessages = result.messages;
        replaceMessages(result.messages);
      }
    }

    const needsTitle = settings.autoTitle
      && readChatSessionSnapshot().sessionName === 'New Chat';

    try {
      if (settings.showStreaming) {
        startStreamingMessage();
        const response = await client.chatStream(
          [{ role: 'system', content: systemContent }, ...chatMessages],
          (chunk) => appendStreamChunk(chunk),
        );
        finalizeStreamingMessage(response);
      } else {
        const response = await client.chatStream(
          [{ role: 'system', content: systemContent }, ...chatMessages],
          () => {},
        );
        appendAssistantMessage(response);
      }

      if (needsTitle) {
        generateSessionTitle(client).catch(() => {});
      }
    } finally {
      setChatLoading(false);
    }
  };

  const connectionStatus = getConnectionStatus(context.source);
  const contextLabel = `${context.status} · ${context.location}`;
  const sessions = showSessions ? listSessions() : [];

  const stopEventPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  const stopShortcutPropagation = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.stopPropagation();
    }
  };

  const isStreamingWithContent = settings.showStreaming && isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    messages[messages.length - 1].content.length > 0;
  const showLoading = isLoading && !isStreamingWithContent;

  return (
    <div
      ref={dragRef}
      role="dialog"
      aria-label="Spirit Ring Chat"
      onKeyDown={stopEventPropagation}
      onKeyUp={stopEventPropagation}
      onMouseDown={stopEventPropagation}
      onMouseUp={stopEventPropagation}
      onClick={stopEventPropagation}
      onCopy={stopEventPropagation}
      onCut={stopEventPropagation}
      onPaste={stopEventPropagation}
      onContextMenu={stopEventPropagation}
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        ...getPositionStyles(),
        width: `${dim.width}px`,
        height: `${dim.height}px`,
        backgroundColor: 'rgba(15, 15, 20, 0.95)',
        border: '1px solid #C5A059',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        color: '#ddd',
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 15px',
          borderBottom: '1px solid rgba(197, 160, 89, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.3)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerCancel={onPointerCancel}
        onPointerUp={onPointerUp}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <strong style={{ color: '#C5A059' }}>Spirit Ring</strong>
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: STATUS_COLORS[connectionStatus],
                boxShadow: `0 0 4px ${STATUS_COLORS[connectionStatus]}`,
                flexShrink: 0,
              }}
              title={`Game data: ${STATUS_LABELS[connectionStatus]}`}
            />
          </div>
          <div style={{ color: '#b9b0a0', fontSize: '11px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contextLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            aria-label="Chat history"
            type="button"
            onClick={() => { setShowSessions(!showSessions); setShowSettings(false); }}
            style={headerButtonStyle}
            title="Chat history"
          >
            ☰
          </button>
          <button
            aria-label="New chat"
            type="button"
            onClick={() => { startNewChat(); setShowSessions(false); }}
            style={headerButtonStyle}
            title="New chat"
          >
            +
          </button>
          <button
            aria-label="Open settings"
            type="button"
            onClick={() => { setShowSettings(!showSettings); setShowSessions(false); }}
            style={headerButtonStyle}
            title="Settings"
          >
            ⚙
          </button>
          <button
            aria-label="Minimize Spirit Ring"
            type="button"
            onClick={onClose}
            style={headerButtonStyle}
            title="Minimize"
          >
            ✖
          </button>
        </div>
      </div>

      {/* Session list panel */}
      {showSessions && (
        <div style={{
          flex: 1,
          padding: '10px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: '#C5A059', fontWeight: 'bold', fontSize: '13px' }}>Chat History</span>
            <button type="button" onClick={() => setShowSessions(false)} style={{ ...headerButtonStyle, fontSize: '12px' }}>Back</button>
          </div>
          {sessions.length === 0 && (
            <div style={{ color: '#888', fontSize: '12px', textAlign: 'center', padding: '20px' }}>No saved chats</div>
          )}
          {sessions.map((s) => {
            const isActive = s.id === chatState.sessionId;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'rgba(197, 160, 89, 0.15)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${isActive ? '#C5A059' : 'rgba(197, 160, 89, 0.1)'}`,
                  cursor: isActive ? 'default' : 'pointer',
                }}
                onClick={() => { if (!isActive) { switchToSession(s.id); setShowSessions(false); } }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: isActive ? '#f3ddab' : '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                {!isActive && (
                  <button
                    type="button"
                    aria-label="Delete chat"
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); setShowSessions(false); setShowSessions(true); }}
                    style={{ ...headerButtonStyle, fontSize: '11px', color: '#f87171' }}
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} settings={settings} setSettings={updateSettings} />
      ) : !showSessions ? (
        <>
          {/* Session name indicator */}
          {sessionName && sessionName !== 'New Chat' && (
            <div style={{
              padding: '4px 15px',
              fontSize: '11px',
              color: '#a69d8c',
              borderBottom: '1px solid rgba(197, 160, 89, 0.1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              backgroundColor: 'rgba(0,0,0,0.15)',
            }}>
              {sessionName}
            </div>
          )}

          {/* Messages */}
          <div
            ref={messageListRef}
            aria-live="polite"
            style={{
              flex: 1,
              padding: '15px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {messages.map((msg, i) => {
              if (msg.role === 'system') {
                return (
                  <div key={i} style={{ textAlign: 'center', color: '#888', fontSize: '11px', padding: '4px 0', fontStyle: 'italic' }}>
                    [Conversation summarized]
                  </div>
                );
              }
              if (msg.role === 'assistant' && msg.content === '') return null;
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor:
                      msg.role === 'user' ? 'rgba(197, 160, 89, 0.2)' : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${
                      msg.role === 'user' ? '#C5A059' : 'rgba(197, 160, 89, 0.3)'
                    }`,
                    padding: '8px',
                    borderRadius: '8px',
                    maxWidth: '85%',
                  }}
                >
                  <span
                    style={{
                      color: msg.role === 'user' ? '#ddd' : '#C5A059',
                      fontWeight: 'bold',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    {msg.role === 'user'
                      ? 'You:'
                      : `${settings.persona === 'Calculator' ? 'Calculator' : 'Elder'}:`}
                  </span>
                  {msg.role === 'assistant' ? (
                    <div style={{ opacity: 0.9 }}>
                      <MarkdownText text={msg.content} fontSize={fontSize} />
                    </div>
                  ) : (
                    <p style={{ margin: 0, opacity: 0.9, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                  )}
                </div>
              );
            })}
            {showLoading && <LoadingAnimation />}
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px',
              borderTop: '1px solid rgba(197, 160, 89, 0.3)',
              display: 'flex',
            }}
          >
            <input
              aria-label="Ask Spirit Ring for guidance"
              type="text"
              placeholder="Ask for guidance..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSend()}
              onKeyDownCapture={stopShortcutPropagation}
              onKeyUpCapture={stopShortcutPropagation}
              onPasteCapture={stopEventPropagation}
              onCopyCapture={stopEventPropagation}
              onCutCapture={stopEventPropagation}
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(197, 160, 89, 0.5)',
                color: 'white',
                padding: '8px',
                borderRadius: '4px',
                outline: 'none',
                fontSize: `${fontSize}px`,
              }}
            />
            <button
              aria-label="Send guidance request"
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              style={{
                marginLeft: '8px',
                backgroundColor: isLoading || !input.trim() ? 'transparent' : 'rgba(197, 160, 89, 0.2)',
                border: `1px solid ${isLoading || !input.trim() ? '#555' : '#C5A059'}`,
                color: isLoading || !input.trim() ? '#555' : '#C5A059',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: isLoading || !input.trim() ? 'default' : 'pointer',
                fontSize: `${fontSize}px`,
              }}
            >
              Send
            </button>
          </div>
        </>
      ) : null}
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
  lineHeight: 1,
};
