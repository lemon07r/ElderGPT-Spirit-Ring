import type { Item, ItemDesc, ModAPI } from 'afnm-types';
import { buildEquipmentPiece } from './equipmentContext';

describe('0.7.6 equipment normalization', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { window: Window }).window = {
      modAPI: undefined,
    } as Window;
  });

  afterEach(() => {
    delete (globalThis as Partial<{ window: Window }>).window;
  });

  it('uses getFullItem and combines stats, combatStats, buffs, and harmony augment', () => {
    const fullItem = {
      name: 'Test Cauldron',
      kind: 'cauldron',
      rarity: 'empowered',
      realm: 'bodyForging',
      stats: { control: 8 },
      combatStats: { power: 12 },
      buffs: [{ buff: { name: 'Resolved Buff' } }],
      harmonyAugment: { type: 'forge', quality: 3 },
    } as unknown as Item;
    window.modAPI = {
      utils: {
        getFullItem: jest.fn(() => fullItem),
      },
    } as unknown as ModAPI;

    const piece = buildEquipmentPiece(
      'Cauldron',
      {
        name: 'Test Cauldron',
        enchantment: { kind: 'test' },
        harmonyAugment: { type: 'forge', quality: 3 },
      } as ItemDesc,
      null,
    );

    expect(window.modAPI.utils.getFullItem).toHaveBeenCalled();
    expect(piece).toEqual(
      expect.objectContaining({
        harmonyType: 'forge',
        harmonyQuality: 3,
        stats: { control: 8, power: 12 },
        buffs: ['Resolved Buff'],
      }),
    );
  });

  it('translates translatable equipment buff display names', () => {
    const fullItem = {
      name: 'Test Talisman',
      kind: 'talisman',
      buffs: [
        {
          buff: {
            name: 'fallback_buff_name',
            displayName: { key: 'buff.test.display_name' },
          },
        },
      ],
    } as unknown as Item;
    window.modAPI = {
      utils: {
        getFullItem: jest.fn(() => fullItem),
        t: jest.fn(() => 'Translated Test Buff'),
      },
    } as unknown as ModAPI;

    const piece = buildEquipmentPiece(
      'Talisman',
      { name: 'Test Talisman' } as ItemDesc,
      null,
    );

    expect(window.modAPI.utils.t).toHaveBeenCalledWith({
      key: 'buff.test.display_name',
    });
    expect(piece?.buffs).toEqual(['Translated Test Buff']);
  });
});
