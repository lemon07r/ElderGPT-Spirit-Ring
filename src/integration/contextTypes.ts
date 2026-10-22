import type {
  HarmonyData,
  ModAPI,
  RecipeHarmonyType,
  SectRank,
  SectServiceKind,
  SectServiceStatus,
} from 'afnm-types';
import type { getGameStateSource } from './gameState';

type CoreFormationAltarStats = ReturnType<
  ModAPI['actions']['getCoreFormationAltarStats']
>;

export interface EquipmentPiece {
  slot: string;
  name: string;
  enchantment: string | null;
  harmonyType: RecipeHarmonyType | null;
  harmonyQuality: number | null;
  stats: Record<string, number> | null;
  buffs: string[];
  extras: Record<string, string | number>;
}

export interface InventoryEntry {
  name: string;
  stacks: number;
}

export interface CombatContext {
  enemyNames: string[];
  enemyCount: number;
  playerHp: number | null;
  playerMaxHp: number | null;
  playerStats: Record<string, number> | null;
  isSpar: boolean;
  logEntries: number | null;
}

export interface CraftingContext {
  recipe: string | null;
  completion: number | null;
  perfection: number | null;
  stability: number | null;
  harmony: number | null;
  harmonyType: RecipeHarmonyType | null;
  harmonyState: HarmonyData | null;
  complexityMultiplier: number | null;
  condition: string | null;
  step: number | null;
  consumedPills: number;
  autoUseItems: Array<string | null>;
  recommendedTechniqueTypes: string[];
  companion: string | null;
  playerStats: Record<string, number> | null;
}

export interface EventSummaryContext {
  year: number;
  month: number;
  day: number;
  texts: string[];
}

export interface SoulShardDelveContext {
  delveKey: string | null;
  run: {
    currentRoomIndex: number;
    currentStageIndex: number;
    nodeCount: number;
    failed: boolean;
    progressQither: number;
    difficultyMultiplier: number;
    blessings: string[];
    curses: string[];
    pendingRewards: number;
  } | null;
  progression: {
    accumulatedQither: number;
    thresholdIndex: number;
    sourcePower: number;
    sourceItem: string | null;
    placedShardCount: number;
  } | null;
}

export interface ResearchContext {
  queue: Array<{
    material: string;
    remaining: string[];
    discovered: string[];
    materialReturned: boolean | null;
    progress: number;
  }>;
  glyphs: RecipeHarmonyType[];
}

export type CoreFormationAltarContext = CoreFormationAltarStats & {
  beatenAltars: string[];
};

export interface SectContext {
  rank: SectRank;
  vaultSlips: InventoryEntry[];
  missionCount: number;
  missions: Array<{ name: string; completedSteps: number; deadlineMonth: number | null }>;
  serviceCount: number;
  services: Array<{ kind: SectServiceKind; status: SectServiceStatus; target: string }>;
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
  maxTechniqueSlots: number | null;
  equipment: EquipmentPiece[];
  inventory: InventoryEntry[];
  techniques: string[];
  craftingActions: string[];
  stances: { name: string; techniques: string[] }[];
  quests: { name: string; completedSteps: number; totalSteps: number; focused: boolean }[];
  characters: {
    name: string;
    approval: number;
    relationship: string | null;
    isFollowing: boolean;
  }[];
  guild: { name: string; rank: number; approval: number } | null;
  sect: SectContext | null;
  calendar: { year: number | null; month: number | null; day: number | null };
  activeEvent: boolean;
  flagCount: number;
  combat: CombatContext | null;
  crafting: CraftingContext | null;
  research: ResearchContext;
  coreFormationAltars: CoreFormationAltarContext | null;
  soulShardDelve: SoulShardDelveContext | null;
  recentEvents: EventSummaryContext[];
}
