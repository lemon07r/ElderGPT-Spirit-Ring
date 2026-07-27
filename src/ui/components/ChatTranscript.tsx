import React from 'react';
import type { Message } from '../../ai/client';
import { LoadingAnimation } from './LoadingAnimation';
import { MarkdownText } from './MarkdownText';

interface Props {
  messages: Message[];
  persona: string;
  fontSize: number;
  showLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatTranscript({
  messages,
  persona,
  fontSize,
  showLoading,
  listRef,
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
        return (
          <div
            key={index}
            style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              backgroundColor: isUser
                ? 'rgba(197, 160, 89, 0.2)'
                : 'rgba(0,0,0,0.3)',
              border: `1px solid ${
                isUser ? '#C5A059' : 'rgba(197, 160, 89, 0.3)'
              }`,
              padding: '8px',
              borderRadius: '8px',
              maxWidth: '85%',
            }}
          >
            <strong
              style={{
                color: isUser ? '#ddd' : '#C5A059',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              {isUser ? 'You:' : `${persona === 'Calculator' ? 'Calculator' : 'Elder'}:`}
            </strong>
            {message.role === 'assistant' ? (
              <MarkdownText text={message.content} fontSize={fontSize} />
            ) : (
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {message.content}
              </p>
            )}
          </div>
        );
      })}
      {showLoading && <LoadingAnimation />}
    </div>
  );
}
