import type { RootState } from 'afnm-types';
import { extractContext } from './contextEngine';

function createSnapshot(overrides: Partial<RootState> = {}): RootState {
  const baseSnapshot = {
    gameData: {
      flags: { spirit_ring_known: 1 },
      mapExploration: {},
    },
    gameEvent: {
      gameEvent: undefined,
      eventStepStack: [],
      indexStack: [],
      textHistory: [],
      eventBuffs: [],
      flags: {},
      storedStates: {},
      analyticsToReport: [],
    },
    combat: {
      player: undefined,
      playerState: undefined,
      breakthrough: undefined,
      enemies: [],
      enemyState: undefined,
      background: 'combat.webp',
      screenEffect: 'sun',
    },
    player: {
      player: {
        imageIndex: 0,
        realm: 'bodyForging',
        realmProgress: 'Early',
        qi: 55,
        hp: 120,
        sex: 'male',
        forename: 'Lan',
        surname: 'Shen',
        physicalStats: {} as RootState['player']['player']['physicalStats'],
        socialStats: {} as RootState['player']['player']['socialStats'],
        affinities: {} as RootState['player']['player']['affinities'],
        reputation: {},
        stances: [],
        knownTechniques: [],
        clothing: undefined,
        talismans: [],
        artefacts: [],
        cauldron: undefined,
        flame: undefined,
        mount: undefined,
        craftingLoadout: [],
        craftingTechniques: [],
        destiny: [],
        background: [],
      },
      knownManuals: [],
      numStancesSeen: 0,
    },
    calendar: {
      year: 2,
      month: 4,
      day: 18,
      events: [],
      resetFlags: [],
    },
    month: {
      monthEnd: false,
      yearEnd: false,
      qi: 0,
      spiritStones: 0,
      sectFavour: 0,
      battlesense: 0,
      craftskill: 0,
      reputations: {},
      completedEvents: [],
      analyticsTracking: {
        craftingActionsUsed: {},
        masteryUsed: {},
        stancesUsed: [],
        recipeSuccess: {
          failed: 0,
          normal: 0,
          perfect: 0,
          sublime: 0,
        },
        combat: {
          victory: 0,
          defeat: 0,
        },
        flaresSpent: 0,
      },
    },
    quests: {
      quests: [],
    },
    inventory: {
      items: [],
      storage: [],
      recipes: [],
      money: 340,
      favour: 12,
    },
    crafting: {
      player: undefined,
      recipe: undefined,
      recipeStats: undefined,
      progressState: undefined,
      consumedPills: 0,
      craftingLog: [],
    },
    newGame: {
      characterCreated: true,
      forename: 'Lan',
      surname: 'Shen',
      sex: 'male',
      imageIndex: 0,
      birthBackground: undefined,
      childBackground: undefined,
      teenBackground: undefined,
      createdAt: 1,
      playtime: 10,
    },
    breakthrough: {} as RootState['breakthrough'],
    location: {
      current: 'Liang Tiao Village',
      locations: {},
      visited: [],
      currentLocationLastEvent: undefined,
      currentLocationLastEventCount: 0,
    },
    screen: {
      screen: 'location',
    },
    herbField: {
      locations: {},
    },
    mine: {
      tiles: {},
      reached: [],
      lastReached: undefined,
    },
    tutorial: {
      currentTutorial: undefined,
      currentStep: 0,
    },
    characters: {
      characterData: {},
      characterNotifications: [],
      globalEncounterCooldown: 0,
    },
    worldMapViewport: {
      mapViewport: undefined,
    },
    mineViewport: {
      mineViewport: undefined,
    },
    version: {
      version: '0.6.49',
    },
    selectedCharacter: {
      selectedCharacter: undefined,
    },
    selectedLocation: {
      selectedLocation: undefined,
    },
    auction: {
      itemIndex: 0,
      playerIn: false,
      characterIn: [],
      lastBidder: 0,
      startPlayerFunds: 0,
      doneBidSkill: false,
      resources: {},
      bidPower: 0,
      wonItems: [],
      playerItemsSold: [],
      totalPlayerSales: 0,
      needsPlayerSellSelection: false,
    },
    mysticalRegion: {
      progressIndex: 0,
      failedRegion: false,
      blessings: [],
      curses: [],
      rewards: [],
      openedRewards: [],
    },
    tournament: {},
    house: {
      inHouse: false,
    },
    mod: {
      activeMods: [],
      data: {},
    },
    dualCultivation: {
      animations: [],
      messages: [],
    },
    guild: {},
    stoneCutting: {
      uncutStones: [],
      participants: [],
      canUseAbility: false,
      abilityPower: 0,
      turn: 0,
      isCutting: false,
      realm: 'bodyForging',
      gainedItems: [],
    },
    fallenStar: {
      activeSites: {},
      starCooldowns: {},
    },
    expedition: {},
    characterUiPreferences: {
      techniqueFilter: '',
      recipeFilters: {
        hideCompleted: false,
        hideLowerRealm: false,
        showOnlyCraftable: false,
        hideNoCraftSkill: false,
        recipeFilter: '',
        selectedRecipe: '',
        pinnedRecipes: [],
        category: 'all',
        realmFilter: 'all',
      },
    },
    soulShardDelve: {} as RootState['soulShardDelve'],
  } as unknown as RootState;

  return { ...baseSnapshot, ...overrides };
}

describe('extractContext', () => {
  it('returns a stable fallback when no snapshot is available', () => {
    expect(extractContext(null)).toEqual(
      expect.objectContaining({
        source: 'unavailable',
        status: 'Idle',
        location: 'Unknown Region',
      }),
    );
  });

  it('normalizes combat and crafting state from the live snapshot shape', () => {
    const snapshot = createSnapshot({
      combat: {
        player: undefined,
        playerState: {
          entityType: 'Player',
          image: 'player.png',
          stats: {
            hp: 77,
            maxhp: 120,
          },
          buffs: [],
          inactiveBuffs: [],
          messages: [],
          animations: [],
        } as unknown as RootState['combat']['playerState'],
        breakthrough: undefined,
        enemies: [
          {
            name: 'River Bandit',
            image: 'bandit.png',
            imageScale: 1,
            realm: 'bodyForging',
            realmProgress: 'Early',
            difficulty: 'easy',
            battleLength: 'short',
            stances: [],
            stanceRotation: [],
            rotationOverrides: [],
            drops: [],
          },
        ],
        enemyState: undefined,
        background: 'combat.webp',
        screenEffect: 'sun',
        isSpar: false,
      },
      crafting: {
        player: undefined,
        recipe: { name: 'Recuperation Pill (I)' } as RootState['crafting']['recipe'],
        recipeStats: undefined,
        progressState: {
          completion: 12,
          perfection: 7,
          stability: 85,
          stabilityPenalty: 0,
          condition: 'positive',
          nextConditions: ['neutral'],
          harmony: 3,
          harmonyTypeData: {
            recommendedTechniqueTypes: ['fusion'],
          },
          step: 4,
          effectTracking: {},
          actionTracking: {},
          pillTracking: {},
        },
        consumedPills: 1,
        craftingLog: [],
      },
    });

    const context = extractContext(snapshot);

    expect(context.status).toBe('InCombat');
    expect(context.screen).toBe('location');
    expect(context.player.name).toBe('Lan Shen');
    expect(context.player.money).toBe(340);
    expect(context.combat).toEqual(
      expect.objectContaining({
        enemyNames: ['River Bandit'],
        enemyCount: 1,
        playerHp: 77,
        playerMaxHp: 120,
      }),
    );
    expect(context.crafting).toEqual(
      expect.objectContaining({
        recipe: 'Recuperation Pill (I)',
        completion: 12,
        perfection: 7,
        stability: 85,
        condition: 'positive',
        recommendedTechniqueTypes: ['fusion'],
      }),
    );
  });
});
