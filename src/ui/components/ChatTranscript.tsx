import React from 'react';
import type { Message } from '../../ai/client';
import { isErrorMessage } from '../../ai/messages';
import { LoadingAnimation } from './LoadingAnimation';
import { MarkdownText } from './MarkdownText';

interface Props {
  messages: Message[];
  persona: string;
  fontSize: number;
  showLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  onRetry?: () => void;
  isLoading?: boolean;
  lookupLabel?: string;
}

export function ChatTranscript({
  messages,
  persona,
  fontSize,
  showLoading,
  listRef,
  onRetry,
  isLoading = false,
  lookupLabel,
}: Props) {
  return (
    <div
      ref={listRef}
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
      {messages.map((message, index) => {
        if (message.role === 'system') {
          return (
            <div
              key={index}
              style={{
                textAlign: 'center',
                color: '#888',
                fontSize: '11px',
                fontStyle: 'italic',
              }}
            >
              [Conversation summarized]
            </div>
          );
        }
        if (message.role === 'assistant' && message.content === '') return null;
        const isUser = message.role === 'user';
        const isError = isErrorMessage(message);
        return (
          <div
            key={index}
            style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              backgroundColor: isUser
                ? 'rgba(197, 160, 89, 0.2)'
                : 'rgba(0,0,0,0.3)',
              border: `1px solid ${
                isError ? '#f87171' : isUser ? '#C5A059' : 'rgba(197, 160, 89, 0.3)'
              }`,
              padding: '8px',
              borderRadius: '8px',
              maxWidth: '85%',
            }}
          >
            <strong
              style={{
                color: isError ? '#f87171' : isUser ? '#ddd' : '#C5A059',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              {isError ? 'Connection error:' : isUser ? 'You:' : `${persona === 'Calculator' ? 'Calculator' : 'Elder'}:`}
            </strong>
            {message.role === 'assistant' ? (
              <>
                {!!message.lookups?.length && (
                  <details style={{ color: '#b9b0a0', fontSize: 11, marginBottom: 6 }}>
                    <summary style={{ cursor: 'pointer' }}>Consulted the records ({message.lookups.length})</summary>
                    <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                      {message.lookups.map((lookup, lookupIndex) => (
                        <li key={lookupIndex} style={{ color: lookup.ok ? '#b9b0a0' : '#f5a0a0' }}>
                          {lookup.label}{!lookup.ok && ' (failed)'}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {message.notice && <p style={{ color: '#b9b0a0', fontSize: 11, margin: '0 0 6px' }}>{message.notice}</p>}
                <MarkdownText text={message.content} fontSize={fontSize} />
              </>
            ) : (
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {message.content}
              </p>
            )}
            {message.stopped && <p style={{ margin: '6px 0 0', color: '#a69d8c', fontSize: 11 }}>(stopped)</p>}
            {isError && index === messages.length - 1 && onRetry && (
              <button type="button" onClick={onRetry} disabled={isLoading} style={{ marginTop: 8 }}>
                Retry
              </button>
            )}
          </div>
        );
      })}
      {showLoading && <LoadingAnimation lookupLabel={lookupLabel} />}
    </div>
  );
}
