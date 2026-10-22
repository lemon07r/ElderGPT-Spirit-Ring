import { addMemoryNote } from '../config/settings';
import {
  GAME_DATA_CATEGORIES,
  getGameEntry,
  getPlayerDetails,
  limitToolText,
  PLAYER_DETAIL_SECTIONS,
  readGameLookupDependencies,
  searchGameData,
  type GameDataCategory,
  type GameLookupDependencies,
  type LookupResult,
  type PlayerDetailSection,
} from '../integration/gameLookup';

/** Provider-neutral, static order/schema/descriptions: part of the cached prefix. */
export const TOOL_DEFINITIONS = [
  {
    name: 'search_game_data',
    description: 'Search authored game data by translated display name or key. Returns up to 20 ranked matches with exact keys; use get_game_entry for full details.',
    parameters: {
      type: 'object', properties: { query: { type: 'string' }, category: { type: 'string', enum: GAME_DATA_CATEGORIES } },
      required: ['query'],
    },
  },
  {
    name: 'get_game_entry',
    description: 'Look up an exact game-data key or display name. Returns authored stats, descriptions, effects and conditions; item sources are static, partial listings, not guaranteed current availability. Dynamic functions are not evaluated.',
    parameters: {
      type: 'object', properties: { category: { type: 'string', enum: GAME_DATA_CATEGORIES }, key: { type: 'string' } },
      required: ['category', 'key'],
    },
  },
  {
    name: 'get_player_details',
    description: 'Read the current player snapshot in more detail: carried/storage inventory with resolved item stats and descriptions (including unequipped items), known combat techniques, or known crafting techniques with their authored effects.',
    parameters: {
      type: 'object', properties: { section: { type: 'string', enum: PLAYER_DETAIL_SECTIONS } },
      required: ['section'],
    },
  },
  {
    name: 'save_note',
    description: 'Save a global standing player preference. Use only when the player explicitly asks you to remember something. Never save inferred preferences or temporary game state. Maximum 500 characters; at most 30 notes.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]['name'];
export type ToolDefinition = typeof TOOL_DEFINITIONS[number];
export type ToolResult = LookupResult;
export interface ToolDependencies extends GameLookupDependencies {
  addMemoryNote?: typeof addMemoryNote;
}

/** All argument access and dispatch are guarded, including throwing data getters. */
export function runTool(name: string, args: unknown, deps?: ToolDependencies): ToolResult {
  let label = name;
  try {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be a JSON object.');
    const values = args as Record<string, unknown>;
    const string = (key: string) => {
      const value = values[key];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Provide a non-blank ${key}.`);
      return value.trim();
    };
    const category = () => {
      const value = string('category');
      if (!(GAME_DATA_CATEGORIES as readonly string[]).includes(value)) throw new Error(`Unknown category. Choose: ${GAME_DATA_CATEGORIES.join(', ')}.`);
      return value as GameDataCategory;
    };
    let result: ToolResult;
    if (name === 'save_note') {
      label = 'memory note';
      // Let the notes store supply its own blank/length/cap error text.
      if (typeof values.text !== 'string') throw new Error('Provide note text as a string.');
      const saved = (deps?.addMemoryNote ?? addMemoryNote)(values.text);
      result = saved.error !== undefined ? { ok: false, text: saved.error, label } : { ok: true, text: `Remembered: ${saved.note.text}`, label: 'Memory note saved' };
    } else if (name === 'search_game_data') {
      const query = string('query');
      label = `search: ${query}`;
      result = searchGameData(query, values.category === undefined ? undefined : category(), deps ?? readGameLookupDependencies());
    } else if (name === 'get_game_entry') {
      label = 'entry lookup';
      result = getGameEntry(category(), string('key'), deps ?? readGameLookupDependencies());
    } else if (name === 'get_player_details') {
      const section = string('section');
      label = `player: ${section}`;
      if (!(PLAYER_DETAIL_SECTIONS as readonly string[]).includes(section)) throw new Error(`Unknown section. Choose: ${PLAYER_DETAIL_SECTIONS.join(', ')}.`);
      result = getPlayerDetails(section as PlayerDetailSection, deps ?? readGameLookupDependencies());
    } else throw new Error('Unknown tool.');
    return { ...result, text: limitToolText(result.text), label: result.label.replace(/\s+/g, ' ').slice(0, 100) };
  } catch (error) {
    return { ok: false, text: limitToolText(`Lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`), label: label.replace(/\s+/g, ' ').slice(0, 100) };
  }
}
