import type { GameContext } from '../../integration/contextEngine';
import { estimateTokens } from '../tokenEstimator';
import { GAME_OVERVIEW } from './gameOverview';
import { COMBAT_KNOWLEDGE } from './combatKnowledge';
import { CRAFTING_KNOWLEDGE } from './craftingKnowledge';
import { CULTIVATION_KNOWLEDGE } from './cultivationKnowledge';
import { STAT_FORMULAS } from './statFormulas';

function tryAdd(sections: string[], block: string, budget: { used: number; max: number }): boolean {
  const cost = estimateTokens(block);
  if (budget.used + cost > budget.max) return false;
  sections.push(block);
  budget.used += cost;
  return true;
}

export function selectKnowledge(context: GameContext, tokenBudget: number): string {
  const sections: string[] = [];
  const budget = { used: 0, max: tokenBudget };

  // Always: game overview (cheapest, broadest)
  tryAdd(sections, GAME_OVERVIEW, budget);

  // Status-driven primary knowledge
  if (context.status === 'InCombat') {
    tryAdd(sections, COMBAT_KNOWLEDGE, budget);
    // Stat formulas are useful for combat math
    tryAdd(sections, STAT_FORMULAS, budget);
  } else if (context.status === 'Crafting') {
    tryAdd(sections, CRAFTING_KNOWLEDGE, budget);
    // Stat formulas help with crafting stat reasoning
    tryAdd(sections, STAT_FORMULAS, budget);
  } else {
    // Idle/Event: cultivation progression is most relevant
    tryAdd(sections, CULTIVATION_KNOWLEDGE, budget);
    // Stat formulas on request (lower priority when idle)
    tryAdd(sections, STAT_FORMULAS, budget);
  }

  // Secondary: if budget remains, add complementary knowledge
  if (context.status === 'InCombat') {
    tryAdd(sections, CULTIVATION_KNOWLEDGE, budget);
  }
  if (context.status === 'Crafting') {
    tryAdd(sections, CULTIVATION_KNOWLEDGE, budget);
  }
  // If idle but combat data visible, add combat knowledge
  if (context.combat && context.status !== 'InCombat') {
    tryAdd(sections, COMBAT_KNOWLEDGE, budget);
  }
  if (context.crafting && context.status !== 'Crafting') {
    tryAdd(sections, CRAFTING_KNOWLEDGE, budget);
  }

  return sections.join('\n\n');
}
