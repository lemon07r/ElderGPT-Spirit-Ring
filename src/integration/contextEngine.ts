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
      }
    : null;

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
  };
}

function getPersonaDescription(persona: string, customPrompt: string): string {
  if (persona === 'Calculator') {
    return 'You are an analytical, cold optimization AI named "The Calculator". Provide dry, numerical, high-signal advice.';
  }

  if (persona === 'Custom') {
    return customPrompt || 'You are a custom AI assistant.';
  }

  return 'You are an ancient, lore-accurate Xianxia cultivation elder named "Spirit Ring". You reside inside a magical ring worn by the player character. Speak in profound idioms, reference the Dao, karma, and qi, and stay concise.';
}

export function getSystemPrompt(persona: string, customPrompt: string, context: GameContext): string {
  return `${getPersonaDescription(persona, customPrompt)}\n\n--- CURRENT GAME STATE ---\n${JSON.stringify(context, null, 2)}`;
}
