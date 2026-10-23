import { runTool } from '../../src/ai/tools';
import { GAME_DATA_CATEGORIES, listGameDataEntries, type GameDataCategory } from '../../src/integration/gameLookup';
import { extractContext, formatGameState } from '../../src/integration/contextEngine';

const api = window.modAPI!;
const dependencies = { gameData: api.gameData, utils: api.utils, readSnapshot: () => api.getGameStateSnapshot() };
const check = (name: string, args: Record<string, unknown>) => {
  const start = performance.now();
  const result = runTool(name, args, dependencies);
  return { ...result, ms: performance.now() - start, size: result.text.length };
};
// Independent expectation: use the game's translator/tag expander, then a browser
// text decoder rather than the lookup normalizer under test.
const readable = (value: unknown) => {
  const element = document.createElement('div');
  element.innerHTML = api.utils.expandTooltipTags(api.utils.t(value as never)).replace(/<br\s*\/?\s*>/gi, '\n');
  return element.textContent ?? '';
};
const expectedName = (category: GameDataCategory, value: Record<string, unknown>, key: string) =>
  readable(value.displayName ?? value.name ?? (category === 'mines' ? value.locationName : undefined)
    ?? (category === 'soul_shard_delves' ? value.location : undefined) ?? key);
const audit = (categories: readonly GameDataCategory[] = GAME_DATA_CATEGORIES) => categories.map((category) => {
  const entries = listGameDataEntries(category, dependencies);
  const selected = entries.slice(0, 2);
  const translatable = entries.find((entry) => typeof entry.value.displayName === 'object');
  const tagged = entries.find((entry) => /<\/?[a-z]|\{\{/.test(JSON.stringify(entry.value.description ?? entry.value.tooltip ?? '')));
  for (const extra of [translatable, tagged]) if (extra && !selected.includes(extra)) selected.push(extra);
  const calls = selected.map((entry) => {
    const name = expectedName(category, entry.value, entry.key);
    const search = check('search_game_data', { category, query: entry.key });
    const byName = check('search_game_data', { category, query: name });
    const get = check('get_game_entry', { category, key: entry.key });
    const failures: string[] = [];
    for (const [kind, result, cap] of [['search', search, 8000], ['byName', byName, 8000], ['get', get, 6000]] as const) {
      if (!result.ok) failures.push(`${kind}: ${result.text}`);
      if (result.size > cap) failures.push(`${kind}: ${result.size} > ${cap}`);
      if (/<\/?[a-z][^>\n]*>|\[object Object\]|"_translatable"/.test(result.text)) failures.push(`${kind}: unreadable tags/object`);
    }
    if (!get.text.startsWith(`${name} (${category};`)) failures.push(`header: expected ${name}`);
    const row = `${category} | ${entry.key} | ${name.replace(/\s+/g, ' ')} |`;
    if (!search.text.includes(row) || !byName.text.includes(row)) failures.push(`search: expected ${row}`);
    return { key: entry.key, name, rawName: entry.value.displayName ?? entry.value.name ?? entry.key, search, byName, get, failures };
  });
  return { category, count: entries.length, calls };
});

const player = () => {
  const snapshot = api.getGameStateSnapshot();
  const before = JSON.stringify(snapshot);
  const calls = ['inventory', 'techniques', 'crafting_techniques'].map((section) => check('get_player_details', { section }));
  const context = extractContext(snapshot);
  const text = formatGameState(context);
  const failures = calls.flatMap((call) => !call.ok || call.size > 8000 ? [call.label] : []);
  for (const call of calls) if (/<\/?[a-z][^>\n]*>|\[object Object\]|"_translatable"/.test(call.text)) failures.push(`${call.label}: unreadable tags/object`);
  if (!text || /\[object Object\]|"_translatable"/.test(text)) failures.push('unreadable context');
  if (before !== JSON.stringify(api.getGameStateSnapshot())) failures.push('snapshot mutated');
  return { calls, context, text, failures };
};
const sources = () => {
  // Cases selected from diagnostics.json; compare exact authored records, not
  // a second implementation of the Sources index.
  const locations = api.gameData.locations as unknown as Record<string, any>;
  const monsters = api.gameData.monsters as unknown as any[];
  const recipes = api.gameData.researchableMap as unknown as Record<string, any[]>;
  const market = locations['Liang Tiao - Lu Bu Lin Festival'].buildings.find((b: any) => b.kind === 'market');
  const herbs = locations['Spirit Herb Garden'].buildings.find((b: any) => b.kind === 'market');
  const vault = locations['Third Mountain'].buildings.find((b: any) => b.kind === 'vault');
  const ancestor = monsters.find((m) => m.name === 'Blossom Ancestor');
  const feicuiman = monsters.find((m) => m.name === 'Feicuiman');
  const recipe = recipes['Tempered Marrow Drop'].find((r) => r.name === 'Ironflesh Pill Recipe');
  const cases = [
    { item: 'Festival Dumpling Ingredients', raw: market.itemPool.mundane[0], expected: `${readable(locations['Liang Tiao - Lu Bu Lin Festival'].displayName ?? 'Liang Tiao - Lu Bu Lin Festival')}: market (itemPool: mundane)` },
    { item: 'Flaring Yang Bud', raw: herbs.itemPool.bodyForging.find((i: any) => i.name === 'Flaring Yang Bud'), expected: 'Spirit Herb Garden: market (itemPool: bodyForging)' },
    { item: "Xuanzang's Formation Core", raw: vault.itemPool.bodyForging[0], expected: "Third Mountain: vault Xuanzang's Formation Set (bodyForging, cost 3)" },
    { item: 'Acknowledgement of Blossom', raw: ancestor.drops.find((d: any) => d.item.name === 'Acknowledgement of Blossom'), expected: 'Blossom Ancestor: drop amount=1, chance=1; condition: equipped_Vow_of_Blossom == 1' },
    { item: 'Feicuiman Chitin', raw: feicuiman.drops[0], expected: 'Feicuiman: drop amount=1, chance=1' },
    { item: 'Ironflesh Pill', raw: recipe, expected: 'Ironflesh Pill Recipe [Tempered Marrow Drop/Ironflesh Pill Recipe]: sublimeItem output' },
  ];
  return cases.map(({ item, raw, expected }) => {
    const result = check('get_game_entry', { category: 'items', key: item });
    const section = result.text.split('\nSources ')[1] ?? '';
    const expectedLines = [expected, ...(item === 'Flaring Yang Bud' ? ['Spirit Herb Garden: market (itemPool: meridianOpening)'] : [])].sort();
    const actualLines = section.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2)).sort();
    const failures: string[] = [];
    if (!raw || !JSON.stringify(raw).includes(item)) failures.push('fixture no longer matches raw game data');
    if (!result.ok || JSON.stringify(actualLines) !== JSON.stringify(expectedLines)) failures.push(`Sources mismatch: expected ${expectedLines.join('; ')}`);
    if (/undefined|\[object Object\]/.test(section)) failures.push('unreadable source');
    return { item, raw, expected: expectedLines, result, failures };
  });
};
(window as any).__elderRuntime = { check, audit, player, sources, readable };
