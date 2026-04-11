import type { GameContext } from '../../integration/contextEngine';
import { estimateTokens } from '../tokenEstimator';
import { GAME_OVERVIEW } from './gameOverview';
import { COMBAT_KNOWLEDGE } from './combatKnowledge';
import { CRAFTING_KNOWLEDGE } from './craftingKnowledge';
import { CULTIVATION_KNOWLEDGE } from './cultivationKnowledge';

export function selectKnowledge(context: GameContext, tokenBudget: number): string {
  const sections: string[] = [GAME_OVERVIEW];
  let used = estimateTokens(GAME_OVERVIEW);

  const statusBlocks: Record<string, string> = {
    InCombat: COMBAT_KNOWLEDGE,
    Crafting: CRAFTING_KNOWLEDGE,
    Event: CULTIVATION_KNOWLEDGE,
    Idle: CULTIVATION_KNOWLEDGE,
  };

  const primary = statusBlocks[context.status];
  if (primary) {
    const cost = estimateTokens(primary);
    if (used + cost <= tokenBudget) {
      sections.push(primary);
      used += cost;
    }
  }

  if (context.status === 'InCombat' || context.status === 'Crafting') {
    const cost = estimateTokens(CULTIVATION_KNOWLEDGE);
    if (used + cost <= tokenBudget) {
      sections.push(CULTIVATION_KNOWLEDGE);
      used += cost;
    }
  }

  if (context.combat && context.status !== 'InCombat') {
    const cost = estimateTokens(COMBAT_KNOWLEDGE);
    if (used + cost <= tokenBudget) {
      sections.push(COMBAT_KNOWLEDGE);
      used += cost;
    }
  }

  if (context.crafting && context.status !== 'Crafting') {
    const cost = estimateTokens(CRAFTING_KNOWLEDGE);
    if (used + cost <= tokenBudget) {
      sections.push(CRAFTING_KNOWLEDGE);
      used += cost;
    }
  }

  return sections.join('\n\n');
}
