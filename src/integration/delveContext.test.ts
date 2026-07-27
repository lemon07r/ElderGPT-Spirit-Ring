import type { RootState } from 'afnm-types';
import { extractSoulShardDelve } from './delveContext';

test('normalizes the 0.7.6 soul-shard run and progression shape', () => {
  const snapshot = {
    soulShardDelve: {
      delveKey: 'needleFairyShard',
      currentRun: {
        nodes: [{ id: 'node-1' }, { id: 'node-2' }],
        currentRoomIndex: 1,
        currentStageIndex: 2,
        failedRun: false,
        progressQither: 42,
        difficultyMultiplier: 1.5,
        blessings: ['blessing'],
        curses: ['curse'],
        rewards: [{}],
        nodeRewards: [{}, {}],
        openedRewards: [],
      },
      progression: {
        needleFairyShard: {
          accumulatedQither: 100,
          thresholdIndex: 2,
          placedShards: [{}, {}],
          sourcePower: 8,
          sourceItem: 'Qither Source',
          rechargeProgress: 0,
          claimedIntensityRewards: 1,
        },
      },
    },
  } as unknown as RootState;

  expect(extractSoulShardDelve(snapshot)).toEqual(
    expect.objectContaining({
      delveKey: 'needleFairyShard',
      run: expect.objectContaining({
        nodeCount: 2,
        currentRoomIndex: 1,
        pendingRewards: 3,
      }),
      progression: expect.objectContaining({
        accumulatedQither: 100,
        placedShardCount: 2,
      }),
    }),
  );
});
