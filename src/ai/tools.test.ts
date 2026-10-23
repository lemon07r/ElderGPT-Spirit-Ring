import type { ModAPI, RootState } from 'afnm-types';
import { addMemoryNote, DEFAULT_SETTINGS, readSettingsSnapshot, updateSettings } from '../config/settings';
import * as gameState from '../integration/gameState';
import { renderGameData } from '../integration/gameLookup';
import { runTool, TOOL_DEFINITIONS, type ToolDependencies } from './tools';

function deps(data: Record<string, unknown>): ToolDependencies {
  return {
    gameData: data as unknown as ModAPI['gameData'],
    utils: {
      t: jest.fn((value) => {
        const key = typeof value === 'string' ? value : 'key' in value ? value.key : value.other;
        return ({ 'item.iron': 'Iron Pill', 'desc.iron': 'Restore <num>12</num> qi.', 'buff.rot': 'Rot' } as Record<string, string>)[key] ?? key;
      }),
      expandTooltipTags: jest.fn((text) => text.replace('{rot}', '<b>Rot</b>')),
    },
  };
}

describe('provider-neutral read-only tools', () => {
  beforeEach(() => { updateSettings(DEFAULT_SETTINGS); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('definitions have stable order, schemas and explicit consent language for saving notes', () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual(['search_game_data', 'get_game_entry', 'get_player_details', 'save_note']);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters).not.toHaveProperty('additionalProperties');
    }
    expect(TOOL_DEFINITIONS[3].description).toContain('only when the player explicitly asks');
  });

  test('search ranks exact, prefix, word, substring matches and filters categories', () => {
    const data = deps({ items: {
      aExact: { name: 'Rot', kind: 'pill' },
      bPrefix: { name: 'Rotten Pill' },
      cWord: { name: 'Greater Rot Pill' },
      dSubstring: { name: 'Carrot Pill' },
    }, buffs: { other: { name: 'Rot', canStack: true } } });
    const all = runTool('search_game_data', { query: 'rOt' }, data);
    expect(all.ok).toBe(true);
    const rows = all.text.split('\n').slice(1);
    expect(rows.map((row) => row.split(' | ').slice(0, 2).join(':'))).toEqual([
      'items:aExact', 'buffs:other', 'items:bPrefix', 'items:cWord', 'items:dSubstring',
    ]);
    const filtered = runTool('search_game_data', { query: 'rot', category: 'buffs' }, data);
    expect(filtered.text).toContain('buffs | other | Rot');
    expect(filtered.text).not.toContain('items |');
    expect(runTool('search_game_data', { query: 'absent' }, data).text).toMatch(/No matches.*Try a shorter name/);
  });

  test('search matches translated names and keys, with at most twenty results', () => {
    const data = deps({ items: {
      'iron_key': { name: 'iron_key', displayName: { _translatable: true, key: 'item.iron' } },
      ...Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`pill${index}`, { name: `Pill ${index}` }])),
    } });
    expect(runTool('search_game_data', { query: 'IRON_KEY' }, data).text).toContain('iron_key | Iron Pill');
    expect(runTool('search_game_data', { query: 'iron pill' }, data).text).toContain('iron_key | Iron Pill');
    const many = runTool('search_game_data', { query: 'pill' }, data);
    expect(many.text).toContain('20 of 26');
    expect(many.text.split('\n').slice(1)).toHaveLength(20);
    expect(many.text.length).toBeLessThanOrEqual(8000);
  });

  test('entry lookup accepts key/display name and handles grouped/array registries', () => {
    const data = deps({ items: { iron: { name: 'iron', displayName: 'item.iron', description: 'desc.iron', qi: 12 } },
      monsters: [{ name: 'Moss Rat', drops: [] }],
      breakthroughs: { bodyForging: [{ name: 'Iron Bones', description: 'More power', physicalStats: { strength: 3 } }] },
      researchableMap: { alchemy: [{ name: 'Iron Pill Recipe', kind: 'recipe' }] },
    });
    const byKey = runTool('get_game_entry', { category: 'items', key: 'iron' }, data);
    expect(byKey).toEqual(runTool('get_game_entry', { category: 'items', key: 'IRON PILL' }, data));
    expect(byKey.label).toBe('Iron Pill (item)');
    expect(byKey.text).toContain('Restore 12 qi.');
    expect(runTool('get_game_entry', { category: 'monsters', key: 'Moss Rat' }, data).ok).toBe(true);
    expect(runTool('get_game_entry', { category: 'breakthroughs', key: 'bodyForging/Iron Bones' }, data).text).toContain('"strength": 3');
    expect(runTool('get_game_entry', { category: 'recipes', key: 'alchemy/Iron Pill Recipe' }, data).ok).toBe(true);
    expect(runTool('get_game_entry', { category: 'items', key: 'missing' }, data).text).toContain('search_game_data');
  });

  test('ambiguous display names require a unique key rather than guessing', () => {
    const data = deps({ items: { one: { name: 'one', displayName: 'Same' }, two: { name: 'two', displayName: 'Same' } } });
    expect(runTool('get_game_entry', { category: 'items', key: 'Same' }, data)).toMatchObject({ ok: false, text: expect.stringContaining('Several entries') });
    expect(runTool('get_game_entry', { category: 'items', key: 'one' }, data).ok).toBe(true);
  });

  test('real-shaped mines and delves search and render translated location names, not registry IDs', () => {
    const data = deps({
      mineConfigs: { yinying: { id: 'yinying', chartTitle: 'Yinying Mine Chart', locationName: 'Yinying Mine', chambers: {} } },
      soulShardDelves: { bifangShard: { key: 'bifangShard', location: 'Domain of Cinders', rooms: [] } },
    });
    data.utils!.t = (value) => ({ 'Yinying Mine': 'Yinying-Mine', 'Domain of Cinders': 'Domäne der Glut' }[String(value)] ?? String(value));
    for (const [category, key, name] of [['mines', 'yinying', 'Yinying-Mine'], ['soul_shard_delves', 'bifangShard', 'Domäne der Glut']]) {
      expect(runTool('get_game_entry', { category, key }, data).text).toMatch(new RegExp(`^${name} \\(`));
      expect(runTool('search_game_data', { category, query: name }, data).text).toContain(`${key} | ${name} |`);
      expect(runTool('get_game_entry', { category, key: name }, data).ok).toBe(true);
    }
  });

  test('serializer translates, expands tags, preserves exact numbers and drops functions, React, cycles and presentation', () => {
    const callback = jest.fn(() => { throw new Error('Must never be called'); });
    const value: Record<string, unknown> = {
      name: 'Test', description: { _translatable: true, key: 'desc.iron' },
      tooltip: 'Gain {rot} &amp; <i>power</i>.', exact: 1.2345678901234567, zero: 0,
      condition: 'hp<50 && qi>10', dynamic: callback, requirements: [callback],
      icon: 'secret.webp', supportImage: { path: 'secret.webp' }, vfx: ['spark'], audio: 'noise', sfx: 'noise',
      component: { $$typeof: Symbol.for('react.transitional.element'), props: { children: 'Never render this' } },
    };
    value.self = value;
    const text = renderGameData(value, deps({}));
    expect(text).toContain('Restore 12 qi.');
    expect(text).toContain('Gain Rot & power.');
    expect(text).toContain(String(value.exact));
    expect(text).toContain('"zero": 0');
    expect(text).toContain('hp<50 && qi>10');
    expect(text).not.toMatch(/dynamic|self|component|secret.webp|supportImage|spark|noise|Never render/);
    expect(callback).not.toHaveBeenCalled();
    expect(text).not.toContain('_translatable');
  });

  test('depth and output size limits are explicit and each tool result stays bounded', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 123 } } } } } } };
    expect(renderGameData(deep, deps({}))).toContain('Depth/size limit');
    const data = deps({ buffs: { enormous: { name: 'Enormous', description: 'x'.repeat(20_000) } } });
    const result = runTool('get_game_entry', { category: 'buffs', key: 'enormous' }, data);
    expect(result.ok).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(6000);
    expect(result.text).toContain('[Truncated;');
  });

  test('serializer stops a 200k-property flat traversal within cumulative budgets', () => {
    const flat = Object.fromEntries(Array.from({ length: 200_000 }, (_, index) => [`field${index}`, index]));
    let reads = 0;
    const value = new Proxy(flat, { get(target, key, receiver) {
      if (String(key).startsWith('field')) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const start = performance.now();
    const output = renderGameData(value, deps({}));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(1500);
    expect(output.length).toBeLessThanOrEqual(6000);
    expect(output).toContain('[Truncated;');
    expect(output).not.toContain('field199999');
  });

  test('item Sources include only authored shop/vault pools, enemy drops and recipe outputs', () => {
    const pill = { name: 'Iron Pill', kind: 'pill', qi: 12 };
    const data = deps({ items: { 'Iron Pill': pill }, locations: { Village: { name: 'Village', buildings: [
      { kind: 'market', itemPool: { bodyForging: [{ name: 'Iron Pill', stacks: 2, condition: 'rank>2' }] } },
      { kind: 'vault', itemPool: { bodyForging: [{ id: 'cache', displayName: 'Pill Cache', cost: 3, rewards: [{ name: 'Iron Pill' }] }] } },
    ] } }, monsters: [{ name: 'Rat', drops: [{ item: pill, amount: 2, chance: 0.125 }] }],
      researchableMap: { pills: [{ name: 'Pill Recipe', baseItem: pill, perfectItem: pill }] },
    });
    const result = runTool('get_game_entry', { category: 'items', key: 'Iron Pill' }, data);
    expect(result.text).toContain('Sources (static listings only; conditions and stock may apply; not exhaustive)');
    expect(result.text).toContain('Village: market (itemPool: bodyForging; condition: rank>2)');
    expect(result.text).toContain('Village: vault Pill Cache (bodyForging, cost 3)');
    expect(result.text).toContain('Rat: drop amount=2, chance=0.125');
    expect(result.text).toContain('Pill Recipe [pills/Pill Recipe]: baseItem/perfectItem output');
  });

  test('Sources retain trimmed renderer market/vault/drop/recipe records', () => {
    const core = { name: "Xuanzang's Formation Core" };
    const pill = { name: 'Ironflesh Pill' };
    const data = deps({
      items: { [core.name]: core, [pill.name]: pill, 'Acknowledgement of Blossom': { name: 'Acknowledgement of Blossom' }, herb: { name: 'Flaring Yang Bud' } },
      locations: {
        'Spirit Herb Garden': { name: 'Spirit Herb Garden', buildings: [{ kind: 'market', itemPool: { bodyForging: [{ name: 'Flaring Yang Bud', stacks: 10 }] }, costMultiplier: 1.5, refreshMonths: 1 }] },
        'Third Mountain': { name: 'Third Mountain', buildings: [{ kind: 'vault', slips: { bodyForging: { name: 'Ruby Treasure Slip' } }, itemPool: { bodyForging: [{ id: "Xuanzang's Formation Set", displayName: "Xuanzang's Formation Set", cost: 3, rewards: [core, { name: 'Formation Blade' }, { name: 'Formation Bell' }] }] } }] },
      },
      monsters: [{ name: 'Blossom Ancestor', drops: [{ item: { name: 'Acknowledgement of Blossom' }, condition: 'equipped_Vow_of_Blossom == 1', chance: 1, amount: 1 }] }],
      researchableMap: { 'Tempered Marrow Drop': [{ kind: 'recipe', name: 'Ironflesh Pill Recipe', baseItem: { name: 'Spirit Core (IV)' }, perfectItem: { name: 'Tempered Marrow Drop' }, sublimeItem: pill, ingredients: [{ item: { name: 'Tempered Marrow Drop' }, quantity: 1 }, { item: { name: 'Spirit Core (IV)' }, quantity: 1 }], forceSublimeCrafting: true }] },
    });
    const source = (key: string) => runTool('get_game_entry', { category: 'items', key }, data).text.split('\nSources ')[1];
    expect(source(core.name)).toContain("Third Mountain: vault Xuanzang's Formation Set (bodyForging, cost 3)");
    expect(source(core.name)).not.toContain('Recipe');
    expect(source(pill.name)).toContain('Ironflesh Pill Recipe [Tempered Marrow Drop/Ironflesh Pill Recipe]: sublimeItem output');
    expect(source('Acknowledgement of Blossom')).toContain('Blossom Ancestor: drop amount=1, chance=1; condition: equipped_Vow_of_Blossom == 1');
    expect(source('herb')).toContain('Spirit Herb Garden: market (itemPool: bodyForging)');
  });

  test('inventory resolves all counts and full item stats without passing live descriptors to helpers', () => {
    const item = { name: 'Iron Pill', stacks: 4, enchantment: { kind: 'Original' } };
    const snapshot = { inventory: { items: [item], storage: [{ name: 'Iron Pill', stacks: 6 }] } } as unknown as RootState;
    const before = JSON.stringify(snapshot);
    const data = deps({ items: { 'Iron Pill': { name: 'Iron Pill', description: 'desc.iron', stats: { qi: 12 } } } });
    data.utils!.getFullItem = jest.fn((desc) => {
      if (desc?.enchantment) desc.enchantment.kind = 'Changed only on a copy';
      return { name: 'Iron Pill', description: 'desc.iron', stats: { qi: 17.5 } } as any;
    });
    jest.spyOn(gameState, 'readGameStateSnapshot').mockReturnValue(snapshot);
    const result = runTool('get_player_details', { section: 'inventory' }, data);
    expect(result.ok).toBe(true);
    expect(result.text).toContain('Iron Pill x4');
    expect(result.text).toContain('Iron Pill x6 [storage]');
    expect(result.text).toContain('"qi": 17.5');
    expect(result.text).toContain('Restore 12 qi.');
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(gameState.readGameStateSnapshot).toHaveBeenCalledTimes(1);
  });

  test('player technique sections use the verified combat/crafting known-reference shapes', () => {
    const data = deps({ techniques: { Palm: { name: 'Palm', tooltip: '<b>Deal 12 damage.</b>' } },
      craftingTechniques: { Heat: { name: 'Heat', tooltip: 'Gain 8 heat', poolCost: 2 } },
    });
    data.readSnapshot = () => ({ player: { player: { knownTechniques: [{ name: 'Palm' }], craftingTechniques: [{ technique: 'Heat' }] } } }) as unknown as RootState;
    expect(runTool('get_player_details', { section: 'techniques' }, data).text).toContain('Deal 12 damage.');
    const crafting = runTool('get_player_details', { section: 'crafting_techniques' }, data);
    expect(crafting.text).toContain('Known crafting_techniques: Heat');
    expect(crafting.text).toContain('"poolCost": 2');
  });

  test('save_note uses the global notes store and returns its blank, length and cap errors', () => {
    expect(runTool('save_note', { text: '  Remember safe progression.  ' })).toEqual({ ok: true, text: 'Remembered: Remember safe progression.', label: 'Memory note saved' });
    expect(readSettingsSnapshot().memoryNotes[0].text).toBe('Remember safe progression.');
    expect(runTool('save_note', { text: ' ' })).toMatchObject({ ok: false, text: 'Enter a note first.' });
    expect(runTool('save_note', { text: 'x'.repeat(501) })).toMatchObject({ ok: false, text: 'Notes must be 500 characters or fewer.' });
    for (let i = 1; i < 30; i++) addMemoryNote(`Note ${i}`);
    const error = runTool('save_note', { text: 'Overflow' });
    expect(error.ok).toBe(false);
    expect(error.text).toBe(addMemoryNote('Also overflow').error);
    expect(readSettingsSnapshot().memoryNotes).toHaveLength(30);
  });

  test('throwing getters and failing dependencies return errors instead of escaping', () => {
    const data = deps({ items: { broken: { name: 'Broken' } } });
    Object.defineProperty(data.gameData!.items!.broken, 'bad', { enumerable: true, get() { throw new Error('Broken getter'); } });
    expect(() => runTool('get_game_entry', { category: 'items', key: 'broken' }, data)).not.toThrow();
    expect(runTool('get_game_entry', { category: 'items', key: 'broken' }, data)).toMatchObject({ ok: false, text: 'Lookup failed: Broken getter' });
    Object.defineProperty(data.gameData!.items!.broken, 'displayName', { get() { throw new Error('Broken name'); } });
    expect(runTool('search_game_data', { query: 'broken' }, data).ok).toBe(false);
    data.readSnapshot = () => { throw new Error('Snapshot unavailable'); };
    expect(runTool('get_player_details', { section: 'inventory' }, data).ok).toBe(false);
    data.addMemoryNote = () => { throw new Error('Storage unavailable'); };
    expect(runTool('save_note', { text: 'Remember' }, data).ok).toBe(false);
  });

  test('invalid arguments and unknown names are safe and descriptive', () => {
    expect(runTool('unknown', {}).ok).toBe(false);
    expect(runTool('search_game_data', null).ok).toBe(false);
    expect(runTool('search_game_data', { query: ' ' }).ok).toBe(false);
    expect(runTool('get_game_entry', { category: 'invalid', key: 'name' }).text).toContain('Unknown category');
    expect(runTool('get_player_details', { section: 'invalid' }).text).toContain('Unknown section');
    expect(runTool('get_player_details', { section: 'inventory' }, { readSnapshot: () => null }).text).toContain('unavailable');
  });
});
