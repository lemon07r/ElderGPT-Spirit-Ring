import type { RootState } from 'afnm-types';
import type { SoulShardDelveContext } from './contextTypes';

export function extractSoulShardDelve(
  snapshot: RootState,
): SoulShardDelveContext | null {
  const state = snapshot.soulShardDelve;
  const delveKey = state?.delveKey ?? null;
  const run = state?.currentRun;
  const progression = delveKey ? state?.progression?.[delveKey] : undefined;
  if (!delveKey && !run) return null;

  return {
    delveKey,
    run: run
      ? {
          currentRoomIndex: run.currentRoomIndex,
          currentStageIndex: run.currentStageIndex,
          nodeCount: run.nodes.length,
          failed: run.failedRun,
          progressQither: run.progressQither,
          difficultyMultiplier: run.difficultyMultiplier,
          blessings: [...run.blessings],
          curses: [...run.curses],
          pendingRewards: run.rewards.length + run.nodeRewards.length,
        }
      : null,
    progression: progression
      ? {
          accumulatedQither: progression.accumulatedQither,
          thresholdIndex: progression.thresholdIndex,
          sourcePower: progression.sourcePower,
          sourceItem: progression.sourceItem ?? null,
          placedShardCount: progression.placedShards.length,
        }
      : null,
  };
}
