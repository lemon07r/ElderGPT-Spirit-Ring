import React from 'react';

interface Props {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  fontSize: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  onAbort: () => void;
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

export function ChatComposer({
  input,
  setInput,
  isLoading,
  fontSize,
  textareaRef,
  onSend,
  onAbort,
}: Props) {
  const change = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
  };
  return (
    <div
      style={{
        padding: '10px',
        borderTop: '1px solid rgba(197, 160, 89, 0.3)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label="Ask Spirit Ring for guidance"
        placeholder="Ask for guidance..."
        value={input}
        onChange={change}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        onKeyDownCapture={stop}
        onKeyUpCapture={stop}
        onPasteCapture={stop}
        onCopyCapture={stop}
        onCutCapture={stop}
        rows={1}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(197, 160, 89, 0.5)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          outline: 'none',
          fontSize: `${fontSize}px`,
          resize: 'none',
          minHeight: '36px',
          maxHeight: '120px',
          lineHeight: '1.4',
          fontFamily: 'sans-serif',
        }}
      />
      <button
        aria-label={isLoading ? 'Stop generation' : 'Send guidance request'}
        type="button"
        onClick={isLoading ? onAbort : onSend}
        disabled={!isLoading && !input.trim()}
        style={{
          marginLeft: '8px',
          backgroundColor: isLoading
            ? 'rgba(248, 113, 113, 0.2)'
            : input.trim()
              ? 'rgba(197, 160, 89, 0.2)'
              : 'transparent',
          border: `1px solid ${isLoading ? '#f87171' : input.trim() ? '#C5A059' : '#555'}`,
          color: isLoading ? '#f87171' : input.trim() ? '#C5A059' : '#555',
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: isLoading || input.trim() ? 'pointer' : 'default',
          fontSize: `${fontSize}px`,
          alignSelf: 'stretch',
        }}
      >
        {isLoading ? 'Stop' : 'Send'}
      </button>
    </div>
  );
}
