import React, { useEffect, useState } from 'react';
import {
  addMemoryNote,
  deleteMemoryNote,
  MAX_MEMORY_NOTE_LENGTH,
  MAX_MEMORY_NOTES,
  type MemoryNote,
  updateMemoryNote,
} from '../../config/settings';

export function MemoryNotesSection({ notes }: { notes: readonly MemoryNote[] }) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = globalThis.setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => globalThis.clearTimeout(timer);
  }, [confirmDeleteId]);

  const counter = (text: string) => (
    <small style={{ color: text.trim().length > MAX_MEMORY_NOTE_LENGTH ? '#f87171' : '#a69d8c' }}>
      {text.trim().length}/{MAX_MEMORY_NOTE_LENGTH} characters
      {text.trim().length > MAX_MEMORY_NOTE_LENGTH && ' — note is too long'}
    </small>
  );
  const atCap = notes.length >= MAX_MEMORY_NOTES;
  return (
    <section aria-label="Notes the Elder remembers" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <strong style={{ color: '#C5A059' }}>Notes the Elder remembers</strong>
      <small style={{ color: '#a69d8c' }}>Standing preferences shared across all chats and saves. {notes.length}/{MAX_MEMORY_NOTES} notes.</small>
      {notes.map((note) => {
        const editing = editingId === note.id;
        const confirming = confirmDeleteId === note.id;
        return (
          <div key={note.id} style={{ padding: 8, border: '1px solid rgba(197,160,89,.25)', borderRadius: 4 }}>
            {editing ? (
              <>
                <textarea aria-label="Edit memory note" value={editText} onChange={(event) => setEditText(event.target.value)} style={textStyle} />
                {counter(editText)}
                <div>
                  <button type="button" disabled={!editText.trim() || editText.trim().length > MAX_MEMORY_NOTE_LENGTH} onClick={() => {
                    const result = updateMemoryNote(note.id, editText);
                    setError(result.error ?? '');
                    if (!result.error) setEditingId(null);
                  }}>Save note</button>
                  <button type="button" onClick={() => { setEditingId(null); setError(''); }}>Cancel edit</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 6px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.text}</p>
                <button type="button" onClick={() => { setEditingId(note.id); setEditText(note.text); setError(''); }}>Edit note</button>
              </>
            )}
            <button type="button" aria-label={confirming ? 'Confirm deletion of note' : 'Delete note'} style={{ color: confirming ? '#f87171' : undefined }} onClick={() => {
              if (!confirming) { setConfirmDeleteId(note.id); return; }
              deleteMemoryNote(note.id);
              setConfirmDeleteId(null);
              if (editing) setEditingId(null);
              setError('');
            }}>{confirming ? 'Delete?' : 'Delete note'}</button>
          </div>
        );
      })}
      <textarea aria-label="New memory note" placeholder="For example: I prefer safe progression over speed." value={newText} onChange={(event) => setNewText(event.target.value)} style={textStyle} />
      {counter(newText)}
      {atCap && <small style={{ color: '#f87171' }}>You can keep up to {MAX_MEMORY_NOTES} notes. Delete a note before adding another.</small>}
      {error && <small role="alert" style={{ color: '#f87171' }}>{error}</small>}
      <button type="button" disabled={atCap || !newText.trim() || newText.trim().length > MAX_MEMORY_NOTE_LENGTH} onClick={() => {
        const result = addMemoryNote(newText);
        setError(result.error ?? '');
        if (!result.error) setNewText('');
      }}>Add note</button>
    </section>
  );
}

const textStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical',
  backgroundColor: 'rgba(0,0,0,.3)', color: '#ddd', border: '1px solid rgba(197,160,89,.3)',
  borderRadius: 4, padding: 6,
};
