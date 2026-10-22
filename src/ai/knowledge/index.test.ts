import { extractContext } from '../../integration/contextEngine';
import { estimateTokens } from '../tokenEstimator';
import { selectKnowledge } from './index';

test.each([
  ['Crafting', 'CRAFTING SYSTEM'],
  ['InCombat', 'COMBAT SYSTEM'],
  ['Idle', 'CULTIVATION & PROGRESSION'],
])('keeps the refreshed %s knowledge within the normal budget', (status, heading) => {
  const knowledge = selectKnowledge({ ...extractContext(null), status }, 2000);
  expect(knowledge).toContain(`${heading} (AFNM 0.7.17)`);
  expect(estimateTokens(knowledge)).toBeLessThanOrEqual(2000);
  if (status === 'Crafting') {
    expect(knowledge).toContain('nine built-in harmonies');
    expect(knowledge).toContain('Captivating Cadence x1.5');
    expect(knowledge).toContain('Returning Cycle x1.3');
    expect(knowledge).toContain('qiCostReduction');
  }
});

test('respects a zero knowledge budget', () => {
  expect(selectKnowledge(extractContext(null), 0)).toBe('');
});
