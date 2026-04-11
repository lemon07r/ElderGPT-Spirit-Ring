import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AIClient, Message } from '../../ai/client';
import { readSettingsSnapshot, subscribeToSettings, updateSettings } from '../../config/settings';
import { extractContext, getSystemPrompt } from '../../integration/contextEngine';
import { readGameStateSnapshot, subscribeToGameState } from '../../integration/gameState';
import {
  appendAssistantMessage,
  appendUserMessage,
  readChatSessionSnapshot,
  setChatLoading,
  subscribeToChatSession,
} from '../chatSession';
import { useDraggable } from '../../utils/useDraggable';
import { isTextEntryElement, pasteClipboardIntoElement } from '../inputShortcuts';
import { SettingsPanel } from './SettingsPanel';

interface Props {
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  setCorner: (corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left') => void;
  onClose: () => void;
}

export function ChatPanel({ corner, setCorner, onClose }: Props) {
  const dragRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, dragPos, isDragging } = useDraggable(setCorner, dragRef);

  const [showSettings, setShowSettings] = useState(false);
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
  const { messages, isLoading } = chatState;

  const getPositionStyles = () => {
    if (dragPos) return { top: dragPos.y, left: dragPos.x, right: 'auto', bottom: 'auto' };
    switch (corner) {
      case 'top-right':
        return { top: '20px', right: '20px' };
      case 'top-left':
        return { top: '20px', left: '20px' };
      case 'bottom-right':
        return { bottom: '20px', right: '20px' };
      case 'bottom-left':
        return { bottom: '20px', left: '20px' };
    }
  };

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, isLoading]);

  useEffect(() => {
    const handleTextShortcut = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
        return;
      }

      const activeElement = document.activeElement;
      if (!dragRef.current?.contains(activeElement) || !isTextEntryElement(activeElement)) {
        return;
      }

      event.stopPropagation();
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void pasteClipboardIntoElement(activeElement);
      }
    };

    window.addEventListener('keydown', handleTextShortcut, true);
    return () => window.removeEventListener('keydown', handleTextShortcut, true);
  }, []);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) {
      return;
    }

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const history = [...readChatSessionSnapshot().messages, userMessage];
    appendUserMessage(trimmedInput);
    setInput('');
    setChatLoading(true);

    const systemContent = getSystemPrompt(settings.persona, settings.customPrompt, context);
    const client = new AIClient({
      url: settings.apiUrl,
      apiKey: settings.apiKey,
      modelId: settings.modelId,
      provider: settings.provider,
      timeoutMs: settings.requestTimeoutSeconds * 1000,
    });

    try {
      const response = await client.chat([{ role: 'system', content: systemContent }, ...history]);
      appendAssistantMessage(response);
    } finally {
      setChatLoading(false);
    }
  };

  const contextLabel = `${context.status} · ${context.location}`;
  const sourceLabel =
    context.source === 'modapi-snapshot'
      ? 'modAPI snapshot'
      : context.source === 'redux-store'
        ? 'Redux fallback'
        : 'No live state';
  const stopEventPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  const stopShortcutPropagation = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.stopPropagation();
    }
  };

  return (
    <div
      ref={dragRef}
      role="dialog"
      aria-label="Spirit Ring Chat"
      onKeyDown={stopEventPropagation}
      onKeyUp={stopEventPropagation}
      onCopy={stopEventPropagation}
      onCut={stopEventPropagation}
      onPaste={stopEventPropagation}
      onContextMenu={stopEventPropagation}
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        ...getPositionStyles(),
        width: '350px',
        height: '500px',
        backgroundColor: 'rgba(15, 15, 20, 0.95)',
        border: '1px solid #C5A059',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        color: '#ddd',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
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
        <div>
          <strong style={{ color: '#C5A059' }}>Spirit Ring</strong>
          <div style={{ color: '#b9b0a0', fontSize: '12px', marginTop: '4px' }}>
            <div>{contextLabel}</div>
            <div>{sourceLabel}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            aria-label="Open settings"
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px' }}
          >
            ⚙
          </button>
          <button
            aria-label="Minimize Spirit Ring"
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px' }}
          >
            ✖
          </button>
        </div>
      </div>

      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} settings={settings} setSettings={updateSettings} />
      ) : (
        <>
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
            {messages.map((msg, i) => (
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
                <p style={{ margin: 0, opacity: 0.9, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              </div>
            ))}
            {isLoading && <div style={{ color: '#aaa', fontStyle: 'italic' }}>Contemplating the Dao...</div>}
          </div>

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
              }}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
