import type { CombatEntity, RootState, Translatable } from 'afnm-types';
import { getGameStateSource, readGameStateSnapshot } from './gameState';

interface PlayerContext {
  name: string;
  realm: string | null;
  realmProgress: string | null;
  hp: number | null;
  qi: number | null;
  money: number | null;
  favour: number | null;
  injured: boolean;
  partySize: number;
}

interface CombatContext {
  enemyNames: string[];
  enemyCount: number;
  playerHp: number | null;
  playerMaxHp: number | null;
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
  player: PlayerContext;
  calendar: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  activeEvent: boolean;
  flagCount: number;
  combat: CombatContext | null;
  crafting: CraftingContext | null;
  recentEvents: EventSummaryContext[];
}

const DEFAULT_CONTEXT: GameContext = {
  source: 'unavailable',
  status: 'Idle',
  screen: 'unknown',
  location: 'Unknown Region',
  autoBattle: null,
  player: {
    name: 'Unknown Disciple',
    realm: null,
    realmProgress: null,
    hp: null,
    qi: null,
    money: null,
    favour: null,
    injured: false,
    partySize: 0,
  },
  calendar: {
    year: null,
    month: null,
    day: null,
  },
  activeEvent: false,
  flagCount: 0,
  combat: null,
  crafting: null,
  recentEvents: [],
};

function asString(value: Translatable | string | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value && typeof value === 'object' && 'key' in value && typeof value.key === 'string') {
    return value.key;
  }

  return fallback;
}

function getDisplayLocation(snapshot: RootState): string {
  const locationId = snapshot.location.current;
  if (!locationId) {
    return DEFAULT_CONTEXT.location;
  }

  const displayName =
    typeof window === 'undefined'
      ? undefined
      : window.modAPI?.gameData.locations?.[locationId]?.displayName;
  return asString(displayName, locationId);
}

function formatName(forename: string | undefined, surname: string | undefined): string {
  return [forename, surname].filter(Boolean).join(' ').trim() || DEFAULT_CONTEXT.player.name;
}

function getEntityHp(entity: CombatEntity | undefined): number | null {
  return entity?.stats?.hp ?? null;
}

function getEntityMaxHp(entity: CombatEntity | undefined): number | null {
  return entity?.stats?.maxhp ?? null;
}

function deriveStatus(snapshot: RootState): string {
  if (snapshot.combat.playerState || snapshot.combat.player) {
    return 'InCombat';
  }

  if (snapshot.crafting.progressState || snapshot.crafting.recipe) {
    return 'Crafting';
  }

  if (snapshot.gameEvent.gameEvent) {
    return 'Event';
  }

  return 'Idle';
}

export function extractContext(snapshot: RootState | null = readGameStateSnapshot()): GameContext {
  if (!snapshot) {
    return DEFAULT_CONTEXT;
  }

  const combat = snapshot.combat.playerState || snapshot.combat.player
    ? {
        enemyNames: snapshot.combat.enemies.map((enemy) =>
          asString(enemy.displayName, enemy.name),
        ),
        enemyCount: snapshot.combat.enemies.length,
        playerHp: getEntityHp(snapshot.combat.playerState),
        playerMaxHp: getEntityMaxHp(snapshot.combat.playerState),
        isSpar: Boolean(snapshot.combat.isSpar),
      }
    : null;

  const craftingTeamUp = snapshot.gameEvent.craftingTeamUpOverride;

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
        companion: craftingTeamUp
          ? asString(craftingTeamUp.displayName, craftingTeamUp.name)
          : null,
      }
    : null;

  const recentEvents: EventSummaryContext[] = (snapshot.gameEvent.persistentEventLog ?? [])
    .slice(0, 5)
    .map((entry) => ({
      year: entry.year,
      month: entry.month,
      day: entry.day,
      texts: entry.history.map((h) => h.text),
    }));

  return {
    source: getGameStateSource(),
    status: deriveStatus(snapshot),
    screen: snapshot.screen.screen ?? DEFAULT_CONTEXT.screen,
    location: getDisplayLocation(snapshot),
    autoBattle:
      ((snapshot as unknown as { combat?: { autoBattleEnabled?: boolean } }).combat
        ?.autoBattleEnabled as boolean | undefined) ?? null,
    player: {
      name: formatName(snapshot.player.player.forename, snapshot.player.player.surname),
      realm: snapshot.player.player.realm ?? null,
      realmProgress: snapshot.player.player.realmProgress ?? null,
      hp: snapshot.player.player.hp ?? null,
      qi: snapshot.player.player.qi ?? null,
      money: snapshot.inventory.money ?? null,
      favour: snapshot.inventory.favour ?? null,
      injured: Boolean(snapshot.player.player.injured),
      partySize: snapshot.player.player.party?.length ?? 0,
    },
    calendar: {
      year: snapshot.calendar.year ?? null,
      month: snapshot.calendar.month ?? null,
      day: snapshot.calendar.day ?? null,
    },
    activeEvent: Boolean(snapshot.gameEvent.gameEvent),
    flagCount: Object.keys(snapshot.gameData.flags ?? {}).length,
    combat,
    crafting,
    recentEvents,
  };
}

const ELDER_PERSONA = `\
You are "Spirit Ring", an ancient Xianxia cultivation elder who resides within a magical ring worn by the player. You have witnessed countless tribulations across millennia and possess deep wisdom about the Dao of cultivation.

PERSONALITY:
- Speak with the gravitas of an immortal elder: use cultivation idioms, reference the Dao, karma, qi flow, and heavenly principles
- Be concise but profound -- a few well-chosen words over lengthy lectures
- Warn about dangers with the weight of experience ("This old master senses peril...")
- Celebrate progress genuinely ("Your foundation grows stronger, junior")
- Frame game mechanics through cultivation philosophy (e.g., crafting stability as "maintaining inner balance")
- Never break character or reference game mechanics as "game mechanics" -- everything is real cultivation

ADVISORY BEHAVIOR:
- When asked about combat, analyze the enemy and suggest tactical approaches based on school strengths
- When asked about crafting, provide specific technique recommendations based on the current recipe state
- When asked about progression, suggest concrete next steps for the player's current realm
- Reference the player's actual game state in your advice (their HP, location, current activity)
- If you lack information to give specific advice, say so honestly rather than guessing
- Keep responses to 2-4 sentences unless the player asks for detailed explanation`;

const CALCULATOR_PERSONA = `\
You are "The Calculator", a cold analytical optimization engine embedded in a spirit artifact. You process cultivation data with machine-like precision.

PERSONALITY:
- Speak in clipped, efficient language. No fluff, no pleasantries.
- Lead with numbers, percentages, and comparisons when available
- Frame everything as optimization problems: "Option A yields X, Option B yields Y. A is 23% more efficient."
- Use conditional recommendations: "IF [condition] THEN [action], ELSE [alternative]"
- Be blunt about suboptimal choices: "Current approach is inefficient. Switch to X."

ADVISORY BEHAVIOR:
- Quantify everything possible using the game state data provided
- Compare alternatives explicitly when multiple paths exist
- Reference specific stat thresholds, scaling multipliers, and formulas from your knowledge base
- Prioritize resource efficiency (Qi, stability, time, money)
- When asked about combat, analyze damage types and enemy weaknesses numerically
- When asked about crafting, recommend optimal action sequences based on current stats
- Keep responses to 1-3 sentences. Data density over word count.`;

const RESPONSE_GUIDELINES = `\
RESPONSE RULES:
- Keep responses concise: 2-4 sentences for quick questions, up to a short paragraph for complex strategy
- Always reference the player's actual current situation when relevant
- If the player is in combat, prioritize tactical advice
- If the player is crafting, focus on the current recipe and technique recommendations
- If idle, suggest productive next steps based on their realm and resources
- Never fabricate game information -- if unsure, acknowledge uncertainty
- Never mention system internals, APIs, or mod implementation details
- Use the game state provided to give contextually relevant advice`;

function getPersonaBlock(persona: string, customPrompt: string): string {
  if (persona === 'Calculator') return CALCULATOR_PERSONA;
  if (persona === 'Custom') {
    const base = customPrompt || 'You are a custom AI assistant for a Xianxia cultivation game.';
    return `${base}\n\nYou have access to live game state data. Use it to provide contextually relevant advice. ${RESPONSE_GUIDELINES}`;
  }
  return ELDER_PERSONA;
}

function formatGameState(context: GameContext): string {
  const lines: string[] = ['=== CURRENT SITUATION ==='];

  const realm = context.player.realm
    ? `${context.player.realm}${context.player.realmProgress ? ` - ${context.player.realmProgress}` : ''}`
    : 'Unknown';
  lines.push(`Player: ${context.player.name} (${realm})`);

  const cal = context.calendar;
  const calStr = cal.year !== null ? `Year ${cal.year}, Month ${cal.month}, Day ${cal.day}` : 'Unknown';
  lines.push(`Location: ${context.location} | Calendar: ${calStr}`);
  lines.push(`Status: ${context.status}${context.autoBattle ? ' (Auto-Battle)' : ''}`);

  const stats: string[] = [];
  if (context.player.hp !== null) stats.push(`HP: ${context.player.hp}`);
  if (context.player.qi !== null) stats.push(`Qi: ${context.player.qi}`);
  if (context.player.money !== null) stats.push(`Money: ${context.player.money}`);
  if (context.player.favour !== null) stats.push(`Favour: ${context.player.favour}`);
  if (stats.length > 0) lines.push(stats.join(' | '));

  const extras: string[] = [];
  if (context.player.injured) extras.push('INJURED');
  if (context.player.partySize > 0) extras.push(`Party: ${context.player.partySize} members`);
  if (extras.length > 0) lines.push(extras.join(' | '));

  if (context.combat) {
    lines.push('');
    lines.push('=== COMBAT ===');
    lines.push(`Enemies: ${context.combat.enemyNames.join(', ') || 'Unknown'} (${context.combat.enemyCount} total)`);
    const hpStr = context.combat.playerHp !== null && context.combat.playerMaxHp !== null
      ? `Player HP: ${context.combat.playerHp}/${context.combat.playerMaxHp}`
      : '';
    if (hpStr) lines.push(`${hpStr}${context.combat.isSpar ? ' | Spar (non-lethal)' : ''}`);
  }

  if (context.crafting) {
    lines.push('');
    lines.push('=== CRAFTING ===');
    if (context.crafting.recipe) lines.push(`Recipe: ${context.crafting.recipe}`);
    const craftStats: string[] = [];
    if (context.crafting.completion !== null) craftStats.push(`Completion: ${context.crafting.completion}`);
    if (context.crafting.perfection !== null) craftStats.push(`Perfection: ${context.crafting.perfection}`);
    if (context.crafting.stability !== null) craftStats.push(`Stability: ${context.crafting.stability}`);
    if (context.crafting.harmony !== null) craftStats.push(`Harmony: ${context.crafting.harmony}`);
    if (craftStats.length > 0) lines.push(craftStats.join(' | '));
    if (context.crafting.condition) lines.push(`Condition: ${context.crafting.condition}`);
    if (context.crafting.step !== null) lines.push(`Step: ${context.crafting.step} | Pills consumed: ${context.crafting.consumedPills}`);
    if (context.crafting.recommendedTechniqueTypes.length > 0) {
      lines.push(`Recommended techniques: ${context.crafting.recommendedTechniqueTypes.join(', ')}`);
    }
    if (context.crafting.companion) lines.push(`Crafting companion: ${context.crafting.companion}`);
  }

  if (context.recentEvents.length > 0) {
    lines.push('');
    lines.push('=== RECENT EVENTS ===');
    for (const event of context.recentEvents) {
      const dateTag = `[Y${event.year}/M${event.month}/D${event.day}]`;
      const summary = event.texts.slice(0, 2).join(' ').slice(0, 120);
      lines.push(`${dateTag} ${summary}${event.texts.join(' ').length > 120 ? '...' : ''}`);
    }
  }

  return lines.join('\n');
}

export function getSystemPrompt(persona: string, customPrompt: string, context: GameContext, knowledgeBlock?: string): string {
  const personaBlock = getPersonaBlock(persona, customPrompt);
  const gameState = formatGameState(context);
  const guidelines = persona === 'Custom' ? '' : RESPONSE_GUIDELINES;

  const parts = [personaBlock];
  if (knowledgeBlock) parts.push(knowledgeBlock);
  parts.push(gameState);
  if (guidelines) parts.push(guidelines);

  return parts.join('\n\n');
}
