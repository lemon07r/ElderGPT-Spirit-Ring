import type { ItemDesc, ModAPI, RootState, Translatable } from 'afnm-types';
import { asDisplayString } from './displayText';
import { readGameStateSnapshot } from './gameState';

export const GAME_DATA_CATEGORIES = [
  'items', 'techniques', 'buffs', 'monsters', 'quests', 'locations',
  'crafting_techniques', 'recipes', 'breakthroughs', 'manuals', 'destinies',
  'enchantments', 'characters', 'guilds', 'mystical_regions', 'harmonies',
  'mines', 'soul_shard_delves',
] as const;
export type GameDataCategory = typeof GAME_DATA_CATEGORIES[number];
export const PLAYER_DETAIL_SECTIONS = ['inventory', 'techniques', 'crafting_techniques'] as const;
export type PlayerDetailSection = typeof PLAYER_DETAIL_SECTIONS[number];
export interface LookupResult { ok: boolean; text: string; label: string }
export interface GameLookupDependencies {
  gameData?: Partial<ModAPI['gameData']>;
  utils?: Partial<Pick<ModAPI['utils'], 't' | 'expandTooltipTags' | 'getFullItem' | 'techniqueFromKnown' | 'craftingTechniqueFromKnown'>>;
  readSnapshot?: () => RootState | null;
}

export const REGISTRY_KEYS = {
  items: 'items', techniques: 'techniques', buffs: 'buffs', monsters: 'monsters',
  quests: 'quests', locations: 'locations', crafting_techniques: 'craftingTechniques',
  recipes: 'researchableMap', breakthroughs: 'breakthroughs', manuals: 'manuals',
  destinies: 'destinies', enchantments: 'enchantments', characters: 'characters',
  guilds: 'guilds', mystical_regions: 'mysticalRegionDefinitions', harmonies: 'harmonyConfigs',
  mines: 'mineConfigs', soul_shard_delves: 'soulShardDelves',
} as const;
const SINGULAR: Record<GameDataCategory, string> = {
  items: 'item', techniques: 'technique', buffs: 'buff', monsters: 'monster', quests: 'quest',
  locations: 'location', crafting_techniques: 'crafting technique', recipes: 'recipe',
  breakthroughs: 'breakthrough', manuals: 'manual', destinies: 'destiny', enchantments: 'enchantment',
  characters: 'character', guilds: 'guild', mystical_regions: 'mystical region', harmonies: 'harmony',
  mines: 'mine', soul_shard_delves: 'soul shard delve',
};
const TRUNCATED = '\n[Truncated; request a specific entry or section for more detail.]';
const OMIT_FIELD = /icon|image|portrait|sprite|texture|vfx|sfx|audio|sound|music|ambience|animation|colour|color/i;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function limitToolText(text: string, max = 8000): string {
  return text.length <= max ? text : text.slice(0, max - TRUNCATED.length) + TRUNCATED;
}

/** No game actions are exposed. C2 may inject these same read-only dependencies. */
export function readGameLookupDependencies(): GameLookupDependencies {
  const api = typeof window !== 'undefined' ? window.modAPI : undefined;
  return {
    gameData: api?.gameData,
    utils: api ? {
      t: api.utils.t, expandTooltipTags: api.utils.expandTooltipTags, getFullItem: api.utils.getFullItem,
      techniqueFromKnown: api.utils.techniqueFromKnown, craftingTechniqueFromKnown: api.utils.craftingTechniqueFromKnown,
    } : undefined,
    readSnapshot: readGameStateSnapshot,
  };
}

function display(value: unknown, fallback: string, deps: GameLookupDependencies): string {
  if (typeof value !== 'string' && !record(value)?._translatable) return fallback;
  const translated = deps.utils?.t?.(value as Translatable);
  return asDisplayString(translated ?? value as Translatable, fallback);
}

function plainText(value: unknown, deps: GameLookupDependencies): string {
  const text = display(value, '', deps);
  const expanded = deps.utils?.expandTooltipTags?.(text) ?? text;
  return expanded.replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?[a-z][\w:-]*(?:\s+[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s<>]+))?)*\s*\/?>/gi, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#39;/g, (entity) => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ',
    }[entity] ?? entity));
}

interface Entry { category: GameDataCategory; key: string; name: string; value: Record<string, unknown>; group?: string }

export function listGameDataEntries(category: GameDataCategory, deps: GameLookupDependencies): Entry[] {
  const registry = deps.gameData?.[REGISTRY_KEYS[category]];
  if (!registry) return [];
  const result: Entry[] = [];
  const keys = new Set<string>();
  const add = (value: unknown, key: string, group?: string) => {
    const data = record(value);
    if (!data) return;
    let uniqueKey = key;
    for (let i = 2; keys.has(uniqueKey); i++) uniqueKey = `${key}#${i}`;
    keys.add(uniqueKey);
    const fallback = typeof data.name === 'string' ? data.name : key;
    const locationName = category === 'mines' ? data.locationName : category === 'soul_shard_delves' ? data.location : undefined;
    result.push({ category, key: uniqueKey, name: plainText(data.displayName ?? data.name ?? locationName ?? fallback, deps), value: data, group });
  };
  const arrayKey = (value: unknown, index: number) => {
    const data = record(value);
    return String(data?.name ?? data?.id ?? data?.kind ?? index);
  };
  if (Array.isArray(registry)) {
    registry.forEach((value, index) => add(value, arrayKey(value, index)));
  } else {
    for (const key of Object.keys(registry).sort(compare)) {
      const value = (registry as Record<string, unknown>)[key];
      if ((category === 'recipes' || category === 'breakthroughs') && Array.isArray(value)) {
        value.forEach((entry, index) => add(entry, `${key}/${arrayKey(entry, index)}`, key));
      } else add(value, key);
    }
  }
  return result;
}

function summary(entry: Entry, deps: GameLookupDependencies): string {
  const parts = ['kind', 'rarity', 'realm', 'realmProgress', 'type'].map((key) => {
    const value = entry.value[key];
    if (typeof value === 'string') return `${key}=${plainText(value, deps)}`;
    if (Array.isArray(value) && value.every((part) => typeof part === 'string')) return `${key}=${value.join('/')}`;
    return '';
  }).filter(Boolean);
  if (entry.group) parts.push(`group=${entry.group}`);
  return parts.join(', ') || SINGULAR[entry.category];
}

function matchRank(text: string, query: string): number {
  const normalized = text.normalize('NFKC').toLowerCase();
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalized)) return 2;
  return normalized.includes(query) ? 3 : Infinity;
}

export function searchGameData(query: string, category: GameDataCategory | undefined, deps: GameLookupDependencies): LookupResult {
  const normalized = query.trim().normalize('NFKC').toLowerCase();
  const matches = (category ? [category] : GAME_DATA_CATEGORIES).flatMap((kind) => listGameDataEntries(kind, deps))
    .map((entry) => ({ entry, rank: Math.min(matchRank(entry.key, normalized), matchRank(entry.name, normalized)) }))
    .filter((entry) => entry.rank !== Infinity)
    .sort((a, b) => a.rank - b.rank || GAME_DATA_CATEGORIES.indexOf(a.entry.category) - GAME_DATA_CATEGORIES.indexOf(b.entry.category) || compare(a.entry.key, b.entry.key));
  const lines = matches.slice(0, 20).map(({ entry }) =>
    `${entry.category} | ${entry.key} | ${entry.name.replace(/\s+/g, ' ')} | ${summary(entry, deps).replace(/\s+/g, ' ')}`);
  return {
    ok: true, label: `search: ${query.trim()}`,
    text: matches.length ? `Matches (${Math.min(20, matches.length)} of ${matches.length}; category | key | display name | summary):\n${lines.join('\n')}`
      : `No matches for "${query.trim()}"${category ? ` in ${category}` : ''}. Try a shorter name, a translation key, or another category.`,
  };
}

/** Serialize authored data only. Never invoke functions/requirements or evaluate unknown scaling. */
export function renderGameData(value: unknown, deps: GameLookupDependencies, max = 6000): string {
  let nodes = 1500;
  let properties = 1500;
  let chars = Math.max(0, max - TRUNCATED.length);
  let truncated = false;
  const ancestors = new Set<object>();
  const exhausted = () => {
    if (nodes > 0 && properties > 0 && chars > 0) return false;
    truncated = true;
    return true;
  };
  const text = (value: string, translate = false): string => {
    // Bound input before tag expansion/regex work, then bound expanded output.
    if (value.length > chars) truncated = true;
    const bounded = value.slice(0, chars);
    const readable = translate ? plainText(bounded, deps) : bounded;
    if (readable.length > chars) truncated = true;
    const result = readable.slice(0, chars);
    chars -= Math.max(bounded.length, result.length) + 2;
    return result;
  };
  const clean = (value: unknown, depth: number): unknown => {
    if (exhausted()) return undefined;
    nodes--;
    if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) return undefined;
    if (typeof value === 'string') return text(value, true);
    if (typeof value === 'bigint') return text(String(value));
    if (value === null || typeof value !== 'object') {
      chars -= String(value).length;
      return typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
    }
    if ('$$typeof' in value || ancestors.has(value)) return undefined;
    if (record(value)?._translatable) return text(plainText(value, deps));
    if (depth >= 6) return text('[Depth/size limit]');
    chars -= 2;
    ancestors.add(value);
    let result: unknown;
    if (Array.isArray(value)) {
      const array: unknown[] = [];
      for (let index = 0; index < Math.min(value.length, 80); index++) {
        if (exhausted()) break;
        properties--;
        chars -= depth * 2 + 4;
        const child = clean(value[index], depth + 1);
        if (child !== undefined) array.push(child);
      }
      if (value.length > 80) truncated = true;
      result = array;
    } else {
      const output: Record<string, unknown> = Object.create(null);
      // Do not materialize/sort every key before a budget can stop the walk.
      for (const key in value) {
        if (exhausted()) break;
        properties--;
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (key.length + depth * 2 + 6 >= chars) { truncated = true; chars = 0; break; }
        chars -= key.length + depth * 2 + 6;
        if (OMIT_FIELD.test(key)) continue;
        const child = clean((value as Record<string, unknown>)[key], depth + 1);
        if (child !== undefined) output[key] = child;
      }
      result = output;
    }
    ancestors.delete(value);
    return result;
  };
  const cleaned = clean(value, 0);
  return limitToolText((JSON.stringify(cleaned, null, 2) ?? 'No readable data.') + (truncated ? TRUNCATED : ''), max);
}

function itemSources(itemName: string, deps: GameLookupDependencies): string {
  const sources = new Set<string>();
  const named = (value: unknown) => record(value)?.name === itemName;
  for (const location of listGameDataEntries('locations', deps)) {
    const buildings = location.value.buildings;
    if (!Array.isArray(buildings)) continue;
    for (const value of buildings) {
      const building = record(value);
      if (!building) continue;
      for (const pool of ['itemPool', 'reputationPool', 'rankPools']) {
        const groups = record(building[pool]);
        for (const group of Object.keys(groups ?? {}).sort(compare)) {
          const stock = groups![group];
          if (!Array.isArray(stock)) continue;
          for (const value of stock) {
            const listing = record(value);
            if (building.kind === 'vault' && Array.isArray(listing?.rewards) && listing.rewards.some(named)) {
              sources.add(`${location.name}: vault ${plainText(listing.displayName ?? listing.id, deps)} (${group}, cost ${listing.cost})`);
            } else if (named(value)) {
              sources.add(`${location.name}: ${String(building.kind)} (${pool}: ${group}${listing?.condition ? `; condition: ${plainText(listing.condition, deps)}` : ''})`);
            }
          }
        }
      }
      const tokenStock = record(record(building.tokenCurrency)?.tokenStock);
      for (const group of Object.keys(tokenStock ?? {}).sort(compare)) {
        const stock = tokenStock![group];
        if (Array.isArray(stock) && stock.some((listing) => named(record(listing)?.item))) sources.add(`${location.name}: token market (${group})`);
      }
    }
  }
  for (const monster of listGameDataEntries('monsters', deps)) {
    const drops = monster.value.drops;
    if (Array.isArray(drops)) for (const value of drops) {
      const drop = record(value);
      if (named(drop?.item)) sources.add(`${monster.name}: drop amount=${drop!.amount}, chance=${drop!.chance}${drop?.condition ? `; condition: ${plainText(drop.condition, deps)}` : ''}`);
    }
  }
  for (const recipe of listGameDataEntries('recipes', deps)) {
    const outputs = ['baseItem', 'perfectItem', 'sublimeItem'].filter((key) => named(recipe.value[key]));
    if (outputs.length) sources.add(`${recipe.name} [${recipe.key}]: ${outputs.join('/')} output`);
  }
  return '\nSources (static listings only; conditions and stock may apply; not exhaustive):\n' +
    (sources.size ? [...sources].sort(compare).map((source) => `- ${source}`).join('\n') : 'No matches indexed in location shops/vaults, monster drops or recipe outputs.');
}

export function getGameEntry(category: GameDataCategory, key: string, deps: GameLookupDependencies): LookupResult {
  const all = listGameDataEntries(category, deps);
  const query = key.trim().normalize('NFKC').toLowerCase();
  const exactKey = all.find((entry) => entry.key.normalize('NFKC').toLowerCase() === query);
  const matches = exactKey ? [exactKey] : all.filter((entry) => entry.name.normalize('NFKC').toLowerCase() === query);
  if (matches.length !== 1) return {
    ok: false, label: 'entry lookup',
    text: matches.length ? `Several entries match that display name. Use a key:\n${matches.slice(0, 20).map((entry) => entry.key).join('\n')}`
      : `No ${category} entry matches "${key}". Use search_game_data with a shorter name to find its exact key.`,
  };
  const entry = matches[0];
  const sources = category === 'items' ? limitToolText(itemSources(String(entry.value.name ?? entry.key), deps), 1400) : '';
  return {
    ok: true, label: `${entry.name} (${SINGULAR[category]})`,
    text: limitToolText(`${entry.name} (${category}; key: ${entry.key})\n${renderGameData(entry.value, deps, 4500)}${sources}`, 6000),
  };
}

export function getPlayerDetails(section: PlayerDetailSection, deps: GameLookupDependencies): LookupResult {
  const snapshot = (deps.readSnapshot ?? readGameStateSnapshot)();
  if (!snapshot) return { ok: false, text: 'The current player snapshot is unavailable.', label: `player: ${section}` };
  const player = snapshot.player?.player;
  if (section === 'inventory') {
    const inventory = [
      ...(snapshot.inventory?.items ?? []).map((item) => ({ item, storage: false })),
      ...(snapshot.inventory?.storage ?? []).map((item) => ({ item, storage: true })),
    ];
    const details = inventory.map(({ item, storage }) => {
      // Helpers receive copies, never the live snapshot's descriptor objects.
      const desc = JSON.parse(JSON.stringify(item)) as ItemDesc;
      const full = deps.utils?.getFullItem?.(desc) ?? deps.gameData?.items?.[item.name];
      const name = plainText(full?.displayName ?? item.name, deps);
      return { item, full, title: `${name} x${item.stacks}${storage ? ' [storage]' : ''}` };
    });
    let text = `Inventory (carried and storage):\n${details.map((entry) => `- ${entry.title}`).join('\n')}\n\nItem details:\n`;
    for (const entry of details) {
      text += `\n${entry.title}\n${renderGameData({ instance: entry.item, definition: entry.full ?? 'Definition unavailable; stats are not known.' }, deps, 2500)}\n`;
      if (text.length > 8000) break;
    }
    return { ok: true, text: inventory.length ? text : 'Inventory and storage are empty.', label: 'player: inventory' };
  }
  const crafting = section === 'crafting_techniques';
  const known = crafting ? player?.craftingTechniques ?? [] : player?.knownTechniques ?? [];
  const resolved = known.map((entry) => {
    const copy = JSON.parse(JSON.stringify(entry));
    const key = 'technique' in entry ? entry.technique : entry.name;
    const full = crafting
      ? deps.utils?.craftingTechniqueFromKnown?.(copy) ?? deps.gameData?.craftingTechniques?.[key]
      : deps.utils?.techniqueFromKnown?.(copy) ?? deps.gameData?.techniques?.[key];
    return { known: entry, definition: full ?? 'Definition unavailable; effects are not known.' };
  });
  let text = `Known ${section}: ${known.map((entry) => 'technique' in entry ? entry.technique : entry.name).join(', ') || 'none'}\n`;
  for (const entry of resolved) {
    text += `\n${renderGameData(entry, deps, 3000)}\n`;
    if (text.length > 8000) break;
  }
  return { ok: true, text, label: `player: ${section}` };
}
