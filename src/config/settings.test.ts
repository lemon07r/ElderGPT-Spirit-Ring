import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  addMemoryNote,
  DEFAULT_SETTINGS,
  deleteMemoryNote,
  MAX_MEMORY_NOTES,
  readSettingsSnapshot,
  SETTINGS_STORAGE_KEY,
  subscribeToSettings,
  updateMemoryNote,
  updateSettings,
} from './settings';
import { resetChatSession } from '../ui/chatSession';
import { MemoryNotesSection } from '../ui/components/MemoryNotesSection';

describe('global memory notes', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    (global as any).window = { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } };
    updateSettings(DEFAULT_SETTINGS);
  });
  afterEach(() => { delete (global as any).window; jest.restoreAllMocks(); });

  function loadNotes(value: unknown) {
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ memoryNotes: value }));
    let notes!: ReturnType<typeof readSettingsSnapshot>['memoryNotes'];
    jest.isolateModules(() => { notes = (require('./settings') as typeof import('./settings')).readSettingsSnapshot().memoryNotes; });
    return notes;
  }

  test('lookups default on for old settings, persist false, and reject invalid persisted values', () => {
    for (const [persisted, expected] of [[{}, true], [{ gameLookups: false }, false], [{ gameLookups: 'false' }, true]] as const) {
      storage.set(SETTINGS_STORAGE_KEY, JSON.stringify(persisted));
      jest.isolateModules(() => {
        expect((require('./settings') as typeof import('./settings')).readSettingsSnapshot().gameLookups).toBe(expected);
      });
    }
    updateSettings({ gameLookups: false });
    expect(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)!).gameLookups).toBe(false);
  });

  test('normalizes persisted notes: trims, drops invalid/blank/duplicate entries, sorts and caps length', () => {
    expect(loadNotes([
      null, 'invalid', { id: 'bad', text: 'No timestamp' },
      { id: ' ', text: 'Blank ID', createdAt: 1 },
      { id: 'blank', text: '  ', createdAt: 1 },
      { id: 'bad-date', text: 'Bad date', createdAt: -1 },
      { id: 'later', text: ` ${'x'.repeat(501)} `, createdAt: 20 },
      { id: ' earlier ', text: '  Prefer safety.  ', createdAt: 10 },
      { id: 'earlier', text: 'Duplicate', createdAt: 30 },
    ])).toEqual([
      { id: 'earlier', text: 'Prefer safety.', createdAt: 10 },
      { id: 'later', text: 'x'.repeat(500), createdAt: 20 },
    ]);
    expect(loadNotes(undefined)).toEqual([]);
    expect(loadNotes({})).toEqual([]);
  });

  test('keeps at most 30 notes in stable creation order, including tied timestamps', () => {
    const notes = Array.from({ length: 35 }, (_, index) => ({ id: `${index}`, text: `Note ${index}`, createdAt: index }));
    expect(loadNotes([...notes].reverse())).toEqual(notes.slice(0, 30));
    const tied = notes.slice(0, 3).map((note) => ({ ...note, createdAt: 1 }));
    expect(loadNotes(tied)).toEqual(tied);
  });

  test('CRUD trims text, preserves identity/creation time, persists and emits updates', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToSettings(listener);
    const added = addMemoryNote('  Prefer safe progression.  ');
    expect(added.error).toBeUndefined();
    const note = added.note!;
    expect(note.text).toBe('Prefer safe progression.');
    const edited = updateMemoryNote(note.id, '  Use concise answers.  ');
    expect(edited).toEqual({ note: { ...note, text: 'Use concise answers.' } });
    expect(readSettingsSnapshot().memoryNotes).toEqual([edited.note]);
    expect(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)!).memoryNotes).toEqual([edited.note]);
    resetChatSession();
    expect(readSettingsSnapshot().memoryNotes).toEqual([edited.note]);
    expect(deleteMemoryNote(note.id)).toBe(true);
    expect(readSettingsSnapshot().memoryNotes).toEqual([]);
    expect(deleteMemoryNote(note.id)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  test('rejects blank/too-long/missing updates without changing notes', () => {
    expect(addMemoryNote('  ').error).toContain('Enter a note');
    expect(addMemoryNote('x'.repeat(501)).error).toContain('500');
    const added = addMemoryNote('A valid note').note!;
    expect(updateMemoryNote(added.id, '').error).toContain('Enter a note');
    expect(updateMemoryNote(added.id, 'x'.repeat(501)).error).toContain('500');
    expect(updateMemoryNote('missing', 'Text').error).toContain('no longer exists');
    expect(readSettingsSnapshot().memoryNotes).toEqual([added]);
  });

  test('identical trimmed/case-insensitive adds return the existing note without writing, even at the cap', () => {
    addMemoryNote('  Prefer Safe Progression.  ');
    for (let index = 1; index < MAX_MEMORY_NOTES; index++) addMemoryNote(`Note ${index}`);
    const first = readSettingsSnapshot().memoryNotes[0];
    const listener = jest.fn();
    const unsubscribe = subscribeToSettings(listener);
    const persisted = storage.get(SETTINGS_STORAGE_KEY);
    for (const text of ['Prefer Safe Progression.', '  prefer safe progression. ', 'PREFER SAFE PROGRESSION.']) {
      const result = addMemoryNote(text);
      expect(result.error).toBeUndefined();
      expect(result.note).toBe(first);
    }
    expect(readSettingsSnapshot().memoryNotes).toHaveLength(MAX_MEMORY_NOTES);
    expect(storage.get(SETTINGS_STORAGE_KEY)).toBe(persisted);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('enforces the note cap but allows edits and deletion at the cap', () => {
    for (let i = 0; i < MAX_MEMORY_NOTES; i++) expect(addMemoryNote(`Note ${i}`).error).toBeUndefined();
    expect(addMemoryNote('Overflow').error).toContain('30');
    const first = readSettingsSnapshot().memoryNotes[0];
    expect(updateMemoryNote(first.id, 'Edited at cap').error).toBeUndefined();
    expect(deleteMemoryNote(first.id)).toBe(true);
    expect(addMemoryNote('Now there is room').error).toBeUndefined();
    expect(readSettingsSnapshot().memoryNotes).toHaveLength(30);
  });

  test('settings section renders notes, edit/delete controls, counters and the cap message', () => {
    const notes = Array.from({ length: 30 }, (_, index) => ({ id: `${index}`, text: `Note ${index}`, createdAt: index }));
    const html = renderToStaticMarkup(React.createElement(MemoryNotesSection, { notes }));
    expect(html).toContain('Notes the Elder remembers');
    expect(html).toContain('Edit note');
    expect(html).toContain('Delete note');
    expect(html).toContain('0/500 characters');
    expect(html).toContain('Delete a note before adding another');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add note<\/button>/);
  });
});
