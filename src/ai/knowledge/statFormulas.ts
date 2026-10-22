export const STAT_FORMULAS = `\
=== VERIFIED STAT GUIDANCE (AFNM 0.7.17) ===

COMBAT STATE:
HP/maxHP, barrier/maxBarrier, power, artefact power, defense, protection,
damage reduction, critical chance/multiplier, school boosts/resistances, and
healing/barrier modifiers may all appear in the live context.

CRAFTING STATE:
Qi Pool, Control, Intensity, critical stats, toxicity resistance, item
effectiveness, qiCostReduction/qiCostPenalty,
stabilityCostReduction/stabilityCostPenalty, success-chance modifiers, and
Completion/Perfection/Stability/Qi boosts may appear. Do not interpret a zero
cost-reduction stat as a zero final action cost.

Equipment can contribute through stats, combatStats, root fields, buffs,
enchantments, and harmony augments. Use the fully resolved equipment values in
the live context. Do not reconstruct totals from the base item definition.

Do not invent conversion ratios, caps, or rounding rules. State the exact live
values used in any calculation and describe unsupported projections as estimates.`;
