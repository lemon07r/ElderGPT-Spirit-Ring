import React from 'react';

export interface SessionListEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface Props {
  sessions: SessionListEntry[];
  activeId: string;
  confirmDeleteId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string, event: React.MouseEvent) => void;
  onNew: () => void;
  onBack: () => void;
}

export function SessionControls({
  sessions,
  activeId,
  confirmDeleteId,
  onSwitch,
  onDelete,
  onNew,
  onBack,
}: Props) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}>
        <strong style={{ color: '#C5A059' }}>Chat History</strong>
        <div>
          <button type="button" onClick={onNew} style={buttonStyle}>+ New Chat</button>
          <button type="button" onClick={onBack} style={buttonStyle}>Back</button>
        </div>
      </div>
      <div style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
        {sessions.length === 0 && (
          <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
            No saved chats
          </div>
        )}
        {sessions.map((session) => {
          const active = session.id === activeId;
          const confirming = session.id === confirmDeleteId;
          return (
            <div
              key={session.id}
              onClick={() => !active && onSwitch(session.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: confirming
                  ? 'rgba(248,113,113,.1)'
                  : active
                    ? 'rgba(197,160,89,.15)'
                    : 'rgba(0,0,0,.2)',
                border: `1px solid ${active ? '#C5A059' : 'rgba(197,160,89,.15)'}`,
                cursor: active ? 'default' : 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {session.name}
                </div>
                <small style={{ color: '#888' }}>
                  {new Date(session.updatedAt).toLocaleString()}
                </small>
              </div>
              <button
                type="button"
                onClick={(event) => onDelete(session.id, event)}
                style={{
                  ...buttonStyle,
                  color: confirming ? '#f87171' : '#888',
                }}
              >
                {confirming ? 'Delete?' : '✕'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid rgba(255,255,255,.15)',
  color: '#aaa',
  cursor: 'pointer',
  marginLeft: '6px',
  padding: '4px 8px',
  borderRadius: '4px',
};
