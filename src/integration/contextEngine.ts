import type {
  CombatStatsMap,
  CurrentCombatState,
  Item,
  ItemDesc,
  Realm,
  RecipeHarmonyType,
  RootState,
} from 'afnm-types';
import { getGameStateSource, readGameStateSnapshot } from './gameState';
import type {
  CombatContext,
  CraftingContext,
  CoreFormationAltarContext,
  EquipmentPiece,
  EventSummaryContext,
  GameContext,
  InventoryEntry,
} from './contextTypes';
import { buildEquipmentPiece } from './equipmentContext';
import { extractSoulShardDelve } from './delveContext';
import { asDisplayString } from './displayText';

export type { GameContext } from './contextTypes';

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
  maxTechniqueSlots: null,
  equipment: [], inventory: [], techniques: [], craftingActions: [],
  stances: [], quests: [], characters: [], guild: null,
  calendar: { year: null, month: null, day: null },
  activeEvent: false, flagCount: 0, combat: null, crafting: null,
  research: { queue: [], glyphs: [] },
  coreFormationAltars: null,
  soulShardDelve: null, recentEvents: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDisplayLocation(snapshot: RootState): string {
  const locationId = snapshot.location.current;
  if (!locationId) return DEFAULT_CONTEXT.location;
  const displayName = typeof window === 'undefined'
    ? undefined : window.modAPI?.gameData?.locations?.[locationId]?.displayName;
  return asDisplayString(displayName, locationId);
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

function getTechniqueSlots(realm: string | null | undefined): number | null {
  if (!realm) return null;
  try {
    const fn = typeof window !== 'undefined' ? window.modAPI?.utils?.getTechniqueSlots : undefined;
    if (fn) return fn(realm as Realm);
  } catch { /* unavailable */ }
  return null;
}

function extractCoreFormationAltars(
  snapshot: RootState,
): CoreFormationAltarContext | null {
  const beatenAltars = snapshot.breakthrough.coreFormation?.beatenAltars ?? [];
  if (beatenAltars.length === 0 || typeof window === 'undefined') return null;

  const aggregate = window.modAPI?.actions?.getCoreFormationAltarStats;
  if (!aggregate) return null;

  try {
    return {
      beatenAltars: [...beatenAltars],
      ...aggregate(snapshot.breakthrough),
    };
  } catch {
    return null;
  }
}

function deriveStatus(snapshot: RootState): string {
  if (
    snapshot.combat.playerState ||
    snapshot.combat.player ||
    (typeof window !== 'undefined' && window.modAPI?.combat?.isInCombat?.())
  ) return 'InCombat';
  if (snapshot.crafting.progressState || snapshot.crafting.recipe) return 'Crafting';
  if (snapshot.gameEvent.gameEvent) return 'Event';
  return 'Idle';
}

function extractCombatContext(snapshot: RootState): CombatContext | null {
  let runtimeCombat: CurrentCombatState | undefined;
  let runtimeLogEntries: number | null = null;

  try {
    const combatApi = window.modAPI?.combat;
    if (combatApi?.isInCombat?.()) {
      runtimeCombat = combatApi.getCombatState?.();
      runtimeLogEntries = combatApi.getCombatLog?.().length ?? null;
    }
  } catch {
    runtimeCombat = undefined;
  }

  const snapshotHasCombat = Boolean(snapshot.combat.playerState || snapshot.combat.player);
  const playerState = runtimeCombat?.playerState ?? snapshot.combat.playerState;
  const enemies = runtimeCombat?.enemies ?? snapshot.combat.enemies;

  if (!snapshotHasCombat && !runtimeCombat) {
    return null;
  }

  return {
    enemyNames: enemies.map((e) => asDisplayString(e.displayName, e.name)),
    enemyCount: enemies.length,
    playerHp: playerState?.stats?.hp ?? null,
    playerMaxHp: playerState?.stats?.maxhp ?? null,
    playerStats: playerState?.stats ? extractKeyStats(playerState.stats) : null,
    isSpar: Boolean(runtimeCombat?.isSpar ?? snapshot.combat.isSpar),
    logEntries: runtimeLogEntries,
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function extractContext(snapshot: RootState | null = readGameStateSnapshot()): GameContext {
  if (!snapshot) return DEFAULT_CONTEXT;

  const itemDb = getItemDatabase();
  const p = snapshot.player.player;

  const combat = extractCombatContext(snapshot);

  const craftingTeamUp = snapshot.gameEvent.craftingTeamUpOverride;
  const craftingPlayer = snapshot.crafting.player;
  const harmonyType =
    snapshot.crafting.recipeStats?.harmonyType ??
    snapshot.crafting.recipe?.harmonyTypeOverride ??
    null;
  const harmonyConfig = harmonyType
    ? window.modAPI?.gameData?.harmonyConfigs?.[harmonyType]
    : undefined;
  const crafting = snapshot.crafting.progressState || snapshot.crafting.recipe
    ? {
        recipe: snapshot.crafting.recipe?.name ?? null,
        completion: snapshot.crafting.progressState?.completion ?? null,
        perfection: snapshot.crafting.progressState?.perfection ?? null,
        stability: snapshot.crafting.progressState?.stability ?? null,
        harmony: snapshot.crafting.progressState?.harmony ?? null,
        harmonyType,
        harmonyState:
          snapshot.crafting.progressState?.harmonyTypeData ?? null,
        complexityMultiplier: harmonyConfig?.complexityMultiplier ?? null,
        condition: snapshot.crafting.progressState?.condition ?? null,
        step: snapshot.crafting.progressState?.step ?? null,
        consumedPills: snapshot.crafting.consumedPills,
        autoUseItems: (
          p.currentCraftingAutoUseLoadout?.slots ?? []
        ).map((slot) => slot?.item ?? null),
        recommendedTechniqueTypes:
          snapshot.crafting.progressState?.harmonyTypeData?.recommendedTechniqueTypes ?? [],
        companion: craftingTeamUp ? asDisplayString(craftingTeamUp.displayName, craftingTeamUp.name) : null,
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
  const questDb = typeof window !== 'undefined'
    ? window.modAPI?.gameData?.quests ?? null
    : null;
  const quests = (snapshot.quests.quests ?? []).map((q) => ({
    name: q.name,
    completedSteps: q.completed.length,
    totalSteps: questDb?.[q.name]?.steps?.length ?? q.completed.length,
  }));

  // NPCs
  const charDb = typeof window !== 'undefined'
    ? window.modAPI?.gameData?.characters ?? null
    : null;
  const followingChar = snapshot.characters.followingCharacter ?? null;
  const characters: GameContext['characters'] = [];
  for (const [name, state] of Object.entries(snapshot.characters.characterData ?? {})) {
    if (state.approval === 0 && !state.beaten && name !== followingChar) continue;
    const charDef = charDb?.[name];
    characters.push({
      name: charDef ? asDisplayString(charDef.displayName, name) : name,
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
    maxTechniqueSlots: getTechniqueSlots(p.realm),
    equipment, inventory, techniques, craftingActions, stances, quests, characters, guild,
    calendar: { year: snapshot.calendar.year ?? null, month: snapshot.calendar.month ?? null, day: snapshot.calendar.day ?? null },
    activeEvent: Boolean(snapshot.gameEvent.gameEvent),
    flagCount: Object.keys(snapshot.gameData.flags ?? {}).length,
    combat, crafting,
    research: {
      queue: (snapshot.research?.queue ?? []).map((entry) => ({
        material: entry.material,
        remaining: [...entry.remaining],
        discovered: [...entry.discovered],
        materialReturned: entry.materialReturned ?? null,
        progress: entry.progress,
      })),
      glyphs: [...(snapshot.research?.glyphs ?? [])],
    },
    coreFormationAltars: extractCoreFormationAltars(snapshot),
    soulShardDelve: extractSoulShardDelve(snapshot),
    recentEvents,
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
- You CAN see: equipped item stats, player stats, combat stats, inventory, techniques, stances (with slot counts), quests, NPCs.
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
    if (eq.harmonyType && eq.harmonyQuality !== null) {
      header.push(`harmony:${eq.harmonyType} Q${eq.harmonyQuality}`);
    }
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
  if (combat.logEntries !== null) lines.push(`Combat log entries: ${combat.logEntries}`);
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
  if (crafting.harmonyType) {
    lines.push(
      `Selected harmony: ${crafting.harmonyType}` +
        (crafting.complexityMultiplier !== null
          ? ` (complexity x${crafting.complexityMultiplier})`
          : ''),
    );
  }
  if (crafting.harmonyState) {
    lines.push(`Harmony state: ${JSON.stringify(crafting.harmonyState)}`);
  }
  if (crafting.autoUseItems.length > 0) {
    lines.push(
      `Crafting auto-use: ${crafting.autoUseItems
        .map((item) => item ?? 'empty')
        .join(', ')}`,
    );
  }
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
  // Stances: combat and idle/event (users plan builds outside combat)
  if (context.status !== 'Crafting' && context.stances.length > 0) {
    const slotInfo = context.maxTechniqueSlots ? ` (${context.maxTechniqueSlots} technique slots per stance)` : '';
    lines.push('', `=== STANCES ===${slotInfo}`);
    for (const s of context.stances) {
      const fill = context.maxTechniqueSlots ? ` [${s.techniques.length}/${context.maxTechniqueSlots}]` : '';
      lines.push(`${s.name}${fill}: ${s.techniques.join(' > ')}`);
    }
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

  if (context.research.queue.length > 0 || context.research.glyphs.length > 0) {
    lines.push('', '=== RESEARCH ===');
    if (context.research.glyphs.length > 0) {
      lines.push(`Glyphs: ${context.research.glyphs.join(', ')}`);
    }
    for (const entry of context.research.queue) {
      lines.push(
        `${entry.material}: progress=${entry.progress}, remaining=${entry.remaining.join(', ') || 'none'}, discovered=${entry.discovered.join(', ') || 'none'}${entry.materialReturned === null ? '' : `, materialReturned=${entry.materialReturned}`}`,
      );
    }
  }

  if (context.coreFormationAltars) {
    lines.push('', '=== CORE FORMATION ALTARS ===');
    lines.push(`Beaten: ${context.coreFormationAltars.beatenAltars.join(', ')}`);
    if (Object.keys(context.coreFormationAltars.combatStats).length > 0) {
      lines.push(
        `Combat rewards: ${JSON.stringify(context.coreFormationAltars.combatStats)}`,
      );
    }
    if (Object.keys(context.coreFormationAltars.craftingStats).length > 0) {
      lines.push(
        `Crafting rewards: ${JSON.stringify(context.coreFormationAltars.craftingStats)}`,
      );
    }
  }

  // Soul Shard Delve
  if (context.soulShardDelve) {
    const delve = context.soulShardDelve;
    lines.push('', `=== SOUL SHARD DELVE === ${delve.delveKey ?? 'active run'}`);
    if (delve.run) {
      lines.push(
        `Room ${delve.run.currentRoomIndex + 1}/${delve.run.nodeCount + 1}, stage ${delve.run.currentStageIndex + 1}, qither=${delve.run.progressQither}, difficulty=x${delve.run.difficultyMultiplier}${delve.run.failed ? ' (failed)' : ''}`,
      );
      lines.push(
        `Blessings: ${delve.run.blessings.join(', ') || 'none'} | Curses: ${delve.run.curses.join(', ') || 'none'} | Pending rewards: ${delve.run.pendingRewards}`,
      );
    }
    if (delve.progression) {
      lines.push(
        `Progression: qither=${delve.progression.accumulatedQither}, threshold=${delve.progression.thresholdIndex}, source=${delve.progression.sourceItem ?? 'none'} (${delve.progression.sourcePower})`,
      );
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
