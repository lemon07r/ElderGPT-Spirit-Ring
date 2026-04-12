import type { CombatEntity, CombatStatsMap, Item, ItemDesc, RootState, Translatable } from 'afnm-types';
import { getGameStateSource, readGameStateSnapshot } from './gameState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EquipmentPiece {
  slot: string;
  name: string;
  enchantment: string | null;
  qualityTier: number | null;
  stats: Record<string, number> | null;
  buffs: string[];
  extras: Record<string, string | number>;
}

interface InventoryEntry {
  name: string;
  stacks: number;
}

interface CombatContext {
  enemyNames: string[];
  enemyCount: number;
  playerHp: number | null;
  playerMaxHp: number | null;
  playerStats: Record<string, number> | null;
  isSpar: boolean;
}

interface CraftingContext {
  recipe: string | null;
  completion: number | null;
  perfection: number | null;
  stability: number | null;
  harmony: number | null;
  condition: string | null;
  step: number | null;
  consumedPills: number;
  recommendedTechniqueTypes: string[];
  companion: string | null;
  playerStats: Record<string, number> | null;
}

interface EventSummaryContext {
  year: number;
  month: number;
  day: number;
  texts: string[];
}

export interface GameContext {
  source: ReturnType<typeof getGameStateSource>;
  status: string;
  screen: string;
  location: string;
  autoBattle: boolean | null;
  player: {
    name: string;
    realm: string | null;
    realmProgress: string | null;
    hp: number | null;
    qi: number | null;
    qiDroplets: number | null;
    money: number | null;
    favour: number | null;
    injured: boolean;
    partySize: number;
    physicalStats: Record<string, number> | null;
    socialStats: Record<string, number> | null;
    affinities: Record<string, number> | null;
    reputation: Record<string, number> | null;
  };
  equipment: EquipmentPiece[];
  inventory: InventoryEntry[];
  techniques: string[];
  craftingActions: string[];
  stances: { name: string; techniques: string[] }[];
  quests: { name: string; completedSteps: number; totalSteps: number }[];
  characters: { name: string; approval: number; relationship: string | null; isFollowing: boolean }[];
  guild: { name: string; rank: number; approval: number } | null;
  calendar: { year: number | null; month: number | null; day: number | null };
  activeEvent: boolean;
  flagCount: number;
  combat: CombatContext | null;
  crafting: CraftingContext | null;
  recentEvents: EventSummaryContext[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT: GameContext = {
  source: 'unavailable',
  status: 'Idle',
  screen: 'unknown',
  location: 'Unknown Region',
  autoBattle: null,
  player: {
    name: 'Unknown Disciple', realm: null, realmProgress: null,
    hp: null, qi: null, qiDroplets: null, money: null, favour: null,
    injured: false, partySize: 0,
    physicalStats: null, socialStats: null, affinities: null, reputation: null,
  },
  equipment: [], inventory: [], techniques: [], craftingActions: [],
  stances: [], quests: [], characters: [], guild: null,
  calendar: { year: null, month: null, day: null },
  activeEvent: false, flagCount: 0, combat: null, crafting: null, recentEvents: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asString(value: Translatable | string | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && 'key' in value && typeof value.key === 'string') return value.key;
  return fallback;
}

function getDisplayLocation(snapshot: RootState): string {
  const locationId = snapshot.location.current;
  if (!locationId) return DEFAULT_CONTEXT.location;
  const displayName = typeof window === 'undefined'
    ? undefined : window.modAPI?.gameData.locations?.[locationId]?.displayName;
  return asString(displayName, locationId);
}

function formatName(forename: string | undefined, surname: string | undefined): string {
  return [forename, surname].filter(Boolean).join(' ').trim() || DEFAULT_CONTEXT.player.name;
}

function nonZeroMap(src: Record<string, number> | null | undefined): Record<string, number> | null {
  if (!src) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number' && v !== 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function getItemDatabase(): Record<string, Item> | null {
  if (typeof window === 'undefined') return null;
  return window.modAPI?.gameData?.items ?? null;
}

function extractItemStats(item: Item): Record<string, number> | null {
  const stats = (item as { stats?: Record<string, unknown> }).stats;
  if (!stats) return null;
  return nonZeroMap(stats as Record<string, number>);
}

function extractBuffNames(item: Item): string[] {
  const buffs = (item as { buffs?: Array<{ buff: { name: string } }> }).buffs;
  if (!buffs || !Array.isArray(buffs)) return [];
  return buffs.map((b) => asString(b.buff?.name, '')).filter(Boolean);
}

function buildEquipmentPiece(slot: string, desc: ItemDesc | undefined, db: Record<string, Item> | null): EquipmentPiece | null {
  if (!desc?.name) return null;
  const full = db?.[desc.name] ?? null;
  const extras: Record<string, string | number> = {};
  if (full) {
    for (const k of ['charisma', 'qiAbsorption', 'speed', 'qi', 'masteryPoints'] as const) {
      const v = (full as unknown as Record<string, unknown>)[k];
      if (typeof v === 'number' && v !== 0) extras[k] = v;
    }
    if (full.rarity) extras.rarity = full.rarity;
    if (full.realm && full.realm !== 'any') extras.realm = full.realm;
  }
  return {
    slot, name: desc.name,
    enchantment: desc.enchantment?.kind ?? null,
    qualityTier: desc.qualityTier ?? null,
    stats: full ? extractItemStats(full) : null,
    buffs: full ? extractBuffNames(full) : [],
    extras,
  };
}

const COMBAT_STAT_KEYS: (keyof CombatStatsMap)[] = [
  'maxhp', 'hp', 'maxbarrier', 'barrier', 'power', 'artefactpower',
  'defense', 'protection', 'dr', 'barrierMitigation', 'critchance',
  'critmultiplier', 'lifesteal', 'vulnerability', 'weakness',
  'damageBoost', 'healingBoost', 'barrierBoost',
  'fistBoost', 'blossomBoost', 'weaponBoost', 'cloudBoost', 'bloodBoost', 'celestialBoost',
  'fistResistance', 'blossomResistance', 'weaponResistance', 'cloudResistance', 'bloodResistance', 'celestialResistance',
];

function extractKeyStats(statsMap: Partial<CombatStatsMap>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const k of COMBAT_STAT_KEYS) {
    const v = statsMap[k];
    if (typeof v === 'number' && v !== 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function deriveStatus(snapshot: RootState): string {
  if (snapshot.combat.playerState || snapshot.combat.player) return 'InCombat';
  if (snapshot.crafting.progressState || snapshot.crafting.recipe) return 'Crafting';
  if (snapshot.gameEvent.gameEvent) return 'Event';
  return 'Idle';
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function extractContext(snapshot: RootState | null = readGameStateSnapshot()): GameContext {
  if (!snapshot) return DEFAULT_CONTEXT;

  const itemDb = getItemDatabase();
  const p = snapshot.player.player;

  const combat = snapshot.combat.playerState || snapshot.combat.player
    ? {
        enemyNames: snapshot.combat.enemies.map((e) => asString(e.displayName, e.name)),
        enemyCount: snapshot.combat.enemies.length,
        playerHp: snapshot.combat.playerState?.stats?.hp ?? null,
        playerMaxHp: snapshot.combat.playerState?.stats?.maxhp ?? null,
        playerStats: snapshot.combat.playerState?.stats
          ? extractKeyStats(snapshot.combat.playerState.stats) : null,
        isSpar: Boolean(snapshot.combat.isSpar),
      }
    : null;

  const craftingTeamUp = snapshot.gameEvent.craftingTeamUpOverride;
  const craftingPlayer = snapshot.crafting.player;
  const crafting = snapshot.crafting.progressState || snapshot.crafting.recipe
    ? {
        recipe: snapshot.crafting.recipe?.name ?? null,
        completion: snapshot.crafting.progressState?.completion ?? null,
        perfection: snapshot.crafting.progressState?.perfection ?? null,
        stability: snapshot.crafting.progressState?.stability ?? null,
        harmony: snapshot.crafting.progressState?.harmony ?? null,
        condition: snapshot.crafting.progressState?.condition ?? null,
        step: snapshot.crafting.progressState?.step ?? null,
        consumedPills: snapshot.crafting.consumedPills,
        recommendedTechniqueTypes:
          snapshot.crafting.progressState?.harmonyTypeData?.recommendedTechniqueTypes ?? [],
        companion: craftingTeamUp ? asString(craftingTeamUp.displayName, craftingTeamUp.name) : null,
        playerStats: craftingPlayer?.stats ? nonZeroMap(craftingPlayer.stats as unknown as Record<string, number>) : null,
      }
    : null;

  const recentEvents: EventSummaryContext[] = (snapshot.gameEvent.persistentEventLog ?? [])
    .slice(0, 5)
    .map((entry) => ({
      year: entry.year, month: entry.month, day: entry.day,
      texts: entry.history.map((h) => h.text),
    }));

  // Equipment
  const equipment: EquipmentPiece[] = [];
  const add = (slot: string, desc: ItemDesc | undefined) => {
    const piece = buildEquipmentPiece(slot, desc, itemDb);
    if (piece) equipment.push(piece);
  };
  add('Clothing', p.clothing);
  (p.talismans ?? []).forEach((t, i) => add(`Talisman ${i + 1}`, t));
  (p.artefacts ?? []).forEach((a, i) => add(`Artefact ${i + 1}`, a));
  add('Mount', p.mount);
  add('Cauldron', p.cauldron);
  add('Flame', p.flame);

  // Compact lists
  const inventory: InventoryEntry[] = (snapshot.inventory.items ?? []).slice(0, 50)
    .map((item) => ({ name: item.name, stacks: item.stacks }));

  const techniques = (p.knownTechniques ?? []).map((t) => t.name);
  const craftingActions = (p.craftingTechniques ?? []).map((t) => t.technique);
  const stances = (p.stances ?? []).map((s) => ({
    name: s.name ?? 'Unnamed', techniques: s.techniques ?? [],
  }));

  // Quests
  const questDb = typeof window !== 'undefined' ? window.modAPI?.gameData.quests ?? null : null;
  const quests = (snapshot.quests.quests ?? []).map((q) => ({
    name: q.name,
    completedSteps: q.completed.length,
    totalSteps: questDb?.[q.name]?.steps?.length ?? q.completed.length,
  }));

  // NPCs
  const charDb = typeof window !== 'undefined' ? window.modAPI?.gameData.characters ?? null : null;
  const followingChar = snapshot.characters.followingCharacter ?? null;
  const characters: GameContext['characters'] = [];
  for (const [name, state] of Object.entries(snapshot.characters.characterData ?? {})) {
    if (state.approval === 0 && !state.beaten && name !== followingChar) continue;
    const charDef = charDb?.[name];
    characters.push({
      name: charDef ? asString(charDef.displayName, name) : name,
      approval: state.approval,
      relationship: charDef?.relationship?.[state.relationshipIndex]?.relationshipCategory ?? null,
      isFollowing: name === followingChar,
    });
  }

  // Guild
  const selectedGuild = snapshot.guild?.selectedGuild ?? null;
  const guild = selectedGuild ? {
    name: selectedGuild,
    rank: snapshot.guild?.guildRanks?.[selectedGuild] ?? 0,
    approval: snapshot.guild?.guildApproval?.[selectedGuild] ?? 0,
  } : null;

  return {
    source: getGameStateSource(),
    status: deriveStatus(snapshot),
    screen: snapshot.screen.screen ?? DEFAULT_CONTEXT.screen,
    location: getDisplayLocation(snapshot),
    autoBattle: ((snapshot as unknown as { combat?: { autoBattleEnabled?: boolean } }).combat
      ?.autoBattleEnabled as boolean | undefined) ?? null,
    player: {
      name: formatName(p.forename, p.surname),
      realm: p.realm ?? null, realmProgress: p.realmProgress ?? null,
      hp: p.hp ?? null, qi: p.qi ?? null,
      qiDroplets: (p as { qiDroplets?: number }).qiDroplets ?? null,
      money: snapshot.inventory.money ?? null, favour: snapshot.inventory.favour ?? null,
      injured: Boolean(p.injured), partySize: p.party?.length ?? 0,
      physicalStats: p.physicalStats ? { ...p.physicalStats } : null,
      socialStats: p.socialStats ? { ...p.socialStats } : null,
      affinities: nonZeroMap(p.affinities),
      reputation: p.reputation && Object.keys(p.reputation).length > 0 ? { ...p.reputation } : null,
    },
    equipment, inventory, techniques, craftingActions, stances, quests, characters, guild,
    calendar: { year: snapshot.calendar.year ?? null, month: snapshot.calendar.month ?? null, day: snapshot.calendar.day ?? null },
    activeEvent: Boolean(snapshot.gameEvent.gameEvent),
    flagCount: Object.keys(snapshot.gameData.flags ?? {}).length,
    combat, crafting, recentEvents,
  };
}

// ---------------------------------------------------------------------------
// System prompt assembly -- single source of truth
// ---------------------------------------------------------------------------

const PERSONAS: Record<string, string> = {
  Elder: `\
You are "Spirit Ring", an ancient Xianxia cultivation elder residing in a magical ring. You have witnessed countless tribulations across millennia.

STYLE: Speak with immortal gravitas; use cultivation idioms, reference the Dao, karma, qi flow. Be concise but profound. Frame game mechanics through cultivation philosophy -- never break character or say "game mechanics." Celebrate progress ("Your foundation grows stronger") and warn of peril ("This old master senses danger").`,

  Calculator: `\
You are "The Calculator", a cold analytical optimization engine embedded in a spirit artifact. Machine-like precision.

STYLE: Clipped, efficient. Lead with numbers, comparisons, percentages. Frame as optimization: "Option A yields X, B yields Y. A is 23% better." Conditional recs: "IF [cond] THEN [action]." Blunt about inefficiency.`,
};

function buildSystemPrompt(persona: string, customPrompt: string, context: GameContext, knowledgeBlock: string): string {
  const parts: string[] = [];

  // 1. Persona
  if (persona === 'Custom') {
    parts.push(customPrompt || 'You are a custom AI assistant for a Xianxia cultivation game.');
  } else {
    parts.push(PERSONAS[persona] ?? PERSONAS.Elder);
  }

  // 2. Core rules (one place, no duplication)
  parts.push(`\
RULES:
- Reference the player's live game state (shown below) in every answer.
- You CAN see: equipped item stats, player stats, combat stats, inventory, techniques, quests, NPCs.
- You CANNOT see: stats of items not equipped/in inventory, enemy internals beyond what combat shows, hidden formulas beyond your knowledge base.
- NEVER fabricate stats, formulas, or item data. If you lack data, say so IMMEDIATELY in your first sentence.
- When calculating, state which values you used and where they came from.
- Keep answers concise: 2-4 sentences for quick questions, a short paragraph for complex strategy.
- Never mention system internals, APIs, or mod implementation details.`);

  // 3. Knowledge (contextual -- already filtered by status)
  if (knowledgeBlock) parts.push(knowledgeBlock);

  // 4. Live game state (tiered by status)
  parts.push(formatGameState(context));

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Tiered game state formatting
// ---------------------------------------------------------------------------

function kvLine(pairs: Record<string, number> | null, label: string): string {
  if (!pairs || Object.keys(pairs).length === 0) return '';
  return `${label}: ${Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join(', ')}`;
}

function formatEquipment(equipment: EquipmentPiece[]): string {
  if (equipment.length === 0) return '';
  const lines = ['', '=== EQUIPMENT ==='];
  for (const eq of equipment) {
    const header = [`[${eq.slot}] ${eq.name}`];
    if (eq.enchantment) header.push(`enchant:${eq.enchantment}`);
    if (eq.qualityTier) header.push(`Q${eq.qualityTier}`);
    if (eq.extras.rarity) header.push(`${eq.extras.rarity}`);
    if (eq.extras.realm) header.push(`${eq.extras.realm}`);
    lines.push(header.join(' | '));
    if (eq.stats) lines.push(`  ${Object.entries(eq.stats).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    if (eq.buffs.length > 0) lines.push(`  buffs: ${eq.buffs.join(', ')}`);
    const misc: string[] = [];
    for (const k of ['charisma', 'qiAbsorption', 'speed', 'masteryPoints'] as const) {
      if (eq.extras[k]) misc.push(`${k}=${eq.extras[k]}`);
    }
    if (misc.length > 0) lines.push(`  ${misc.join(', ')}`);
  }
  return lines.join('\n');
}

function formatCombat(combat: CombatContext): string {
  const lines = ['', '=== COMBAT ==='];
  lines.push(`Enemies: ${combat.enemyNames.join(', ') || 'Unknown'} (${combat.enemyCount})`);
  if (combat.playerHp !== null && combat.playerMaxHp !== null) {
    lines.push(`Player HP: ${combat.playerHp}/${combat.playerMaxHp}${combat.isSpar ? ' (Spar)' : ''}`);
  }
  const sl = kvLine(combat.playerStats, 'Stats');
  if (sl) lines.push(sl);
  return lines.join('\n');
}

function formatCrafting(crafting: CraftingContext): string {
  const lines = ['', '=== CRAFTING ==='];
  if (crafting.recipe) lines.push(`Recipe: ${crafting.recipe}`);
  const vals: string[] = [];
  if (crafting.completion !== null) vals.push(`Completion:${crafting.completion}`);
  if (crafting.perfection !== null) vals.push(`Perfection:${crafting.perfection}`);
  if (crafting.stability !== null) vals.push(`Stability:${crafting.stability}`);
  if (crafting.harmony !== null) vals.push(`Harmony:${crafting.harmony}`);
  if (vals.length > 0) lines.push(vals.join(' | '));
  if (crafting.condition) lines.push(`Condition: ${crafting.condition}`);
  if (crafting.step !== null) lines.push(`Step: ${crafting.step} | Pills: ${crafting.consumedPills}`);
  if (crafting.recommendedTechniqueTypes.length > 0) {
    lines.push(`Recommended: ${crafting.recommendedTechniqueTypes.join(', ')}`);
  }
  if (crafting.companion) lines.push(`Companion: ${crafting.companion}`);
  const sl = kvLine(crafting.playerStats, 'Crafting Stats');
  if (sl) lines.push(sl);
  return lines.join('\n');
}

function formatGameState(context: GameContext): string {
  const lines: string[] = ['=== GAME STATE ==='];

  // Always: core identity
  const realm = context.player.realm
    ? `${context.player.realm}${context.player.realmProgress ? ' - ' + context.player.realmProgress : ''}`
    : 'Unknown';
  lines.push(`Player: ${context.player.name} (${realm})`);
  const cal = context.calendar;
  lines.push(`Location: ${context.location} | ${cal.year !== null ? `Y${cal.year}/M${cal.month}/D${cal.day}` : 'Unknown date'}`);
  lines.push(`Status: ${context.status}${context.autoBattle ? ' (Auto-Battle)' : ''}`);

  const vitals: string[] = [];
  if (context.player.hp !== null) vitals.push(`HP:${context.player.hp}`);
  if (context.player.qi !== null) vitals.push(`Qi:${context.player.qi}`);
  if (context.player.qiDroplets !== null) vitals.push(`Droplets:${context.player.qiDroplets}`);
  if (context.player.money !== null) vitals.push(`Money:${context.player.money}`);
  if (context.player.favour !== null) vitals.push(`Favour:${context.player.favour}`);
  if (vitals.length > 0) lines.push(vitals.join(' | '));

  const flags: string[] = [];
  if (context.player.injured) flags.push('INJURED');
  if (context.player.partySize > 0) flags.push(`Party:${context.player.partySize}`);
  if (flags.length > 0) lines.push(flags.join(' | '));

  // Always: physical/social stats (compact)
  const phys = kvLine(context.player.physicalStats, 'Body');
  if (phys) lines.push(phys);
  const social = kvLine(context.player.socialStats, 'Social');
  if (social) lines.push(social);
  const aff = kvLine(context.player.affinities, 'Affinities');
  if (aff) lines.push(aff);

  // Always: equipment (players frequently ask about gear)
  lines.push(formatEquipment(context.equipment));

  // Activity-specific sections
  if (context.combat) lines.push(formatCombat(context.combat));
  if (context.crafting) lines.push(formatCrafting(context.crafting));

  // Techniques/stances: only when in combat or idle (not during crafting bloat)
  if (context.status !== 'Crafting' && context.techniques.length > 0) {
    lines.push('', `=== TECHNIQUES === ${context.techniques.join(', ')}`);
  }
  // Crafting actions: only when crafting
  if (context.status === 'Crafting' && context.craftingActions.length > 0) {
    lines.push('', `=== CRAFTING ACTIONS === ${context.craftingActions.join(', ')}`);
  }
  // Stances: only when in combat
  if (context.status === 'InCombat' && context.stances.length > 0) {
    lines.push('', '=== STANCES ===');
    for (const s of context.stances) lines.push(`${s.name}: ${s.techniques.join(' > ')}`);
  }

  // Inventory: always (compact one-liner)
  if (context.inventory.length > 0) {
    lines.push('', `=== INVENTORY === ${context.inventory.map((i) => `${i.name} x${i.stacks}`).join(', ')}`);
  }

  // Quests: only when idle/event
  if ((context.status === 'Idle' || context.status === 'Event') && context.quests.length > 0) {
    lines.push('', '=== QUESTS ===');
    for (const q of context.quests) lines.push(`${q.name} (${q.completedSteps}/${q.totalSteps})`);
  }

  // NPCs: only when idle/event
  if ((context.status === 'Idle' || context.status === 'Event') && context.characters.length > 0) {
    lines.push('', '=== NPCs ===');
    for (const c of context.characters) {
      const p = [c.name];
      if (c.relationship) p.push(c.relationship);
      p.push(`${c.approval}`);
      if (c.isFollowing) p.push('(following)');
      lines.push(p.join(' | '));
    }
  }

  // Reputation
  if (context.player.reputation && Object.keys(context.player.reputation).length > 0) {
    lines.push(`Reputation: ${Object.entries(context.player.reputation).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }

  // Guild
  if (context.guild) {
    lines.push(`Guild: ${context.guild.name} rank=${context.guild.rank} approval=${context.guild.approval}`);
  }

  // Recent events: always (compact)
  if (context.recentEvents.length > 0) {
    lines.push('', '=== RECENT EVENTS ===');
    for (const event of context.recentEvents) {
      const summary = event.texts.slice(0, 2).join(' ').slice(0, 120);
      lines.push(`[Y${event.year}/M${event.month}/D${event.day}] ${summary}${event.texts.join(' ').length > 120 ? '...' : ''}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSystemPrompt(persona: string, customPrompt: string, context: GameContext, knowledgeBlock?: string): string {
  return buildSystemPrompt(persona, customPrompt, context, knowledgeBlock ?? '');
}
