import type { ModAPI, RootState } from 'afnm-types';
import { extractContext, getSystemPrompt } from './contextEngine';

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
      persistentEventLog: [],
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
        imageId: 'player',
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
      imageId: 'player',
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
      version: '0.7.17',
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
    sect: {
      rank: 'outerDisciple', disciples: [], authoredMembers: [],
      nextDiscipleSequence: 0, populationTarget: 0, populationEvents: [],
    },
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
    const ctx = extractContext(null);
    expect(ctx).toEqual(
      expect.objectContaining({
        source: 'unavailable',
        status: 'Idle',
        location: 'Unknown Region',
        maxTechniqueSlots: null,
        soulShardDelve: null,
      }),
    );
  });

  it('returns empty recentEvents when no persistent event log exists', () => {
    const snapshot = createSnapshot();
    const context = extractContext(snapshot);
    expect(context.recentEvents).toEqual([]);
  });

  it('extracts the most recent 5 persistent event log entries', () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({
      year: 2,
      month: 3,
      day: i + 1,
      history: [{ text: `Event ${i + 1}`, sfx: 'confirm' as const }],
    }));
    const snapshot = createSnapshot({
      gameEvent: {
        ...createSnapshot().gameEvent,
        persistentEventLog: entries,
      },
    });
    const context = extractContext(snapshot);
    expect(context.recentEvents).toHaveLength(5);
    expect(context.recentEvents[0]).toEqual({
      year: 2,
      month: 3,
      day: 1,
      texts: ['Event 1'],
    });
    expect(context.recentEvents[4]).toEqual({
      year: 2,
      month: 3,
      day: 5,
      texts: ['Event 5'],
    });
  });

  it('includes crafting companion from craftingTeamUpOverride', () => {
    const snapshot = createSnapshot({
      gameEvent: {
        ...createSnapshot().gameEvent,
        craftingTeamUpOverride: {
          name: 'elder_mei_buff',
          displayName: { key: 'Elder Mei' },
          icon: 'mei.png',
          canStack: false,
          effects: [],
          stacks: 1,
          displayLocation: 'companion',
        } as RootState['gameEvent']['craftingTeamUpOverride'],
      },
      crafting: {
        player: undefined,
        recipe: { name: 'Recuperation Pill (I)' } as RootState['crafting']['recipe'],
        recipeStats: undefined,
        progressState: undefined,
        consumedPills: 0,
        craftingLog: [],
      },
    });
    const context = extractContext(snapshot);
    expect(context.crafting?.companion).toBe('Elder Mei');
  });

  it('sets crafting companion to null when no craftingTeamUpOverride', () => {
    const snapshot = createSnapshot({
      crafting: {
        player: undefined,
        recipe: { name: 'Iron Pill (I)' } as RootState['crafting']['recipe'],
        recipeStats: undefined,
        progressState: undefined,
        consumedPills: 0,
        craftingLog: [],
      },
    });
    const context = extractContext(snapshot);
    expect(context.crafting?.companion).toBeNull();
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

  it('includes 0.7.6 Core Formation altar aggregates and research return state', () => {
    (globalThis as typeof globalThis & { window: Window }).window = {
      modAPI: {
        actions: {
          getCoreFormationAltarStats: jest.fn(() => ({
            combatStats: {
              power: { value: 0.1, stat: 'power' },
            },
            craftingStats: {},
            altarContributions: [],
          })),
        },
      } as unknown as ModAPI,
    } as Window;

    try {
      const snapshot = createSnapshot({
        breakthrough: {
          coreFormation: {
            beatenAltars: ['Burning Core'],
          },
        } as RootState['breakthrough'],
        research: {
          queue: [{
            material: 'Spirit Iron',
            remaining: ['Spirit Blade'],
            discovered: [],
            materialReturned: true,
            progress: 2,
          }],
          glyphs: [],
        },
      });

      const context = extractContext(snapshot);

      expect(context.coreFormationAltars).toEqual(
        expect.objectContaining({
          beatenAltars: ['Burning Core'],
          combatStats: {
            power: { value: 0.1, stat: 'power' },
          },
        }),
      );
      expect(context.research.queue[0]?.materialReturned).toBe(true);
    } finally {
      delete (globalThis as Partial<{ window: Window }>).window;
    }
  });

  it('includes active delve modifiers and pending rewards in the prompt', () => {
    const snapshot = createSnapshot({
      soulShardDelve: {
        delveKey: 'needleFairyShard',
        currentRun: {
          nodes: [{ id: 'node-1' }],
          currentRoomIndex: 0,
          currentStageIndex: 1,
          failedRun: false,
          progressQither: 20,
          difficultyMultiplier: 1.5,
          blessings: ['Focused Mind'],
          curses: ['Brittle Core'],
          rewards: [{}],
          nodeRewards: [{}, {}],
          openedRewards: [],
        },
        progression: {},
      } as unknown as RootState['soulShardDelve'],
    });

    const prompt = getSystemPrompt(
      'Calculator',
      '',
      extractContext(snapshot),
    );

    expect(prompt).toContain('Blessings: Focused Mind');
    expect(prompt).toContain('Curses: Brittle Core');
    expect(prompt).toContain('Pending rewards: 3');
  });

  it('resolves deferred event text on each snapshot instead of serializing objects', () => {
    let language = 'English';
    const t = jest.fn(() => `${language} event`);
    (globalThis as typeof globalThis & { window: Window }).window = {
      modAPI: { utils: { t } } as unknown as ModAPI,
    } as Window;
    try {
      const snapshot = createSnapshot();
      snapshot.gameEvent.persistentEventLog = [{
        year: 2, month: 4, day: 18,
        history: [{ text: { _translatable: true, key: 'Event' }, sfx: 'confirm' }],
      }];
      expect(extractContext(snapshot).recentEvents[0].texts).toEqual(['English event']);
      language = 'French';
      const prompt = getSystemPrompt('Calculator', '', extractContext(snapshot));
      expect(prompt).toContain('French event');
      expect(prompt).not.toContain('[object Object]');
    } finally {
      delete (globalThis as Partial<{ window: Window }>).window;
    }
  });

  it('marks the focused quest in idle context', () => {
    const snapshot = createSnapshot();
    snapshot.quests = {
      focusedQuest: 'Promotion',
      quests: [{ name: 'Promotion', seenUpTo: 0, completed: [0], killTally: {}, raidsComplete: 0 }],
    };
    expect(getSystemPrompt('Calculator', '', extractContext(snapshot))).toContain('Promotion (1/1) [focused]');
  });

  it.each(['captivatingCadence', 'returningCycle'] as const)('preserves %s and split crafting costs', (harmonyType) => {
    const snapshot = createSnapshot();
    snapshot.crafting.recipe = { name: 'Test Craft', harmonyTypeOverride: harmonyType } as NonNullable<RootState['crafting']['recipe']>;
    snapshot.crafting.player = {
      stats: { qiCostReduction: 20, qiCostPenalty: 10, stabilityCostReduction: 30, stabilityCostPenalty: 5 },
    } as RootState['crafting']['player'];
    const context = extractContext(snapshot);
    expect(context.crafting?.harmonyType).toBe(harmonyType);
    const prompt = getSystemPrompt('Calculator', '', context);
    expect(prompt).toContain('qiCostReduction=20, qiCostPenalty=10, stabilityCostReduction=30, stabilityCostPenalty=5');
  });

  it('includes compact read-only sect rank, slips, accepted missions, and pending services', () => {
    const snapshot = createSnapshot();
    snapshot.sect.rank = 'coreDisciple';
    snapshot.sect.services = [
      { id: '1', kind: 'materialRequest', itemName: 'Spirit Iron', requestedQuantity: 3, status: 'ready', cost: 10, requestedAt: { year: 2, month: 4, day: 1 } },
      { id: '2', kind: 'reforge', item: { name: 'Robes' }, materialCosts: [], status: 'collected', cost: 10, requestedAt: { year: 2, month: 4, day: 1 } },
    ];
    snapshot.inventory.items = [
      ...Array.from({ length: 50 }, (_, i) => ({ name: `Item ${i}`, stacks: 1 })),
      { name: 'Treasure Slip (I)', stacks: 3 }, { name: 'Treasure Slip (I)', stacks: 2 },
    ];
    snapshot.location.locations = {
      'Third Mountain': {
        buildingState: { mission: { kind: 'mission', accepted: [{ realm: 'bodyForging', rarity: 'mundane', quest: 'Patrol', condition: '1' }], missions: [] } },
        currentMapEventName: undefined, currentMapEventDuration: 0, mapEventCooldown: {},
      },
    };
    snapshot.quests.quests = [{ name: 'Patrol', seenUpTo: 0, completed: [0], killTally: {}, raidsComplete: 0, deadlineMonth: 30 }];
    (globalThis as typeof globalThis & { window: Window }).window = {
      modAPI: { gameData: {
        locations: { 'Third Mountain': { buildings: [{ kind: 'vault', slips: { bodyForging: { name: 'Treasure Slip (I)' } } }] } },
      } } as unknown as ModAPI,
    } as Window;
    try {
      const before = JSON.stringify(snapshot);
      const context = extractContext(snapshot);
      expect(context.sect).toEqual({
        rank: 'coreDisciple', vaultSlips: [{ name: 'Treasure Slip (I)', stacks: 5 }],
        missionCount: 1, missions: [{ name: 'Patrol', completedSteps: 1, deadlineMonth: 30 }],
        serviceCount: 1, services: [{ kind: 'materialRequest', status: 'ready', target: 'Spirit Iron' }],
      });
      const prompt = getSystemPrompt('Calculator', '', context);
      expect(prompt).toContain('=== SECT === rank=coreDisciple');
      expect(prompt).toContain('Vault slips: Treasure Slip (I) x5');
      expect(prompt).toContain('Mission: Patrol, steps completed=1, deadline absolute month=30');
      expect(prompt).toContain('Service: materialRequest Spirit Iron (ready)');
      expect(prompt).not.toContain('Service: reforge');
      expect(JSON.stringify(snapshot)).toBe(before);
    } finally {
      delete (globalThis as Partial<{ window: Window }>).window;
    }
  });

  it('bounds sect lists, omits inactive missions, and supports absent sect state', () => {
    const snapshot = createSnapshot();
    snapshot.sect.services = Array.from({ length: 8 }, (_, i) => ({
      id: String(i), kind: 'commissionCrafting' as const, recipeName: `Recipe ${i}`,
      attempts: 1, ingredientCosts: [], status: 'active' as const, cost: 10,
      requestedAt: { year: 2, month: 4, day: 1 },
    }));
    const sect = extractContext(snapshot).sect;
    expect(sect?.serviceCount).toBe(8);
    expect(sect?.services).toHaveLength(5);
    expect(sect?.missions).toEqual([]);
    expect(extractContext({ ...snapshot, sect: undefined } as unknown as RootState).sect).toBeNull();
    expect(extractContext(null).sect).toBeNull();
  });
});
