export const CRAFTING_KNOWLEDGE = `\
=== CRAFTING SYSTEM (AFNM 0.7.17) ===

Crafting is action-based. Techniques spend Qi Pool and/or Stability and change
Completion, Perfection, condition, buffs, and harmony state. A craft resolves
automatically when its outcome requirements are reached; do not advise the
player to look for a manual "finish craft" action.

OUTCOMES:
- Basic, perfect, and sublime requirements are outcome bands evaluated together.
- Treat the required Completion and Perfection conditions as conjunctive: both
  must be satisfied for an outcome that requires both.
- The live context values and recipe targets are authoritative. Do not infer a
  result from one bar alone.

PLAYER-SELECTED HARMONIES:
On a sublime craft the player selects any unlocked harmony; harmony is not
derived from item kind. The selected value is stored on recipeStats.harmonyType.
The nine built-in harmonies are Forge Works, Alchemical Arts, Inscribed
Patterns, Spiritual Resonance, Formless Way, Enhancing Echo, and Eccentric
Decree, plus Captivating Cadence and Returning Cycle.

Each harmony has its own state machine and a complexity multiplier applied to
the recipe's Completion and Perfection targets at craft start:
- Forge Works x1.2
- Alchemical Arts x1.2
- Inscribed Patterns x0.9
- Spiritual Resonance x1.3
- Formless Way x1.5
- Enhancing Echo x1.3
- Eccentric Decree x1.0
- Captivating Cadence x1.5
- Returning Cycle x1.3

Use the live "Selected harmony", "Harmony state", and complexity values before
giving harmony-specific advice. Enhancing Echo can alter live action costs;
Formless Way begins at and pins a nonzero harmony value.
Captivating Cadence builds a chain by changing action types. Returning Cycle
tracks spent Qi Pool to gain charges; stabilize actions consume those charges
for Harmony and Returned Precision. Use their live state, not Forge Works rules.

AUTO-USE:
AFNM has a native crafting auto-use loadout, separate from the combat loadout.
Eligible items are evaluated before a technique is performed. Respect the live
slot list and never assume the legacy player.autoUseItems field is current.

ITEM AUGMENTS:
Sublime-crafted and quality-dropped equipment can carry harmonyAugment
{type, quality}. Full item resolution applies its harmony bonus and enchantment.
dropQuality is transient input and is not the persisted equipment quality field.

CORE STATS:
- Qi Intensity contributes to Completion.
- Qi Control contributes to Perfection.
- Qi Pool is spent by actions.
- Stability reaching the failure boundary can end the craft.
- Toxicity limits usable crafting consumables.
- Qi/Stability costs use separate qiCostReduction, qiCostPenalty,
  stabilityCostReduction, and stabilityCostPenalty stats, all starting at zero.
  Reduction lowers costs; penalty raises them. The old poolCostPercentage and
  stabilityCostPercentage multipliers are obsolete. Flat Qi Pool cost and
  harmony/buff effects can also affect final costs.
- Completion, Perfection, Stability, and Qi boosts are distinct modifiers.
- Some crafting techniques spend Qi Droplets. Do not assume only items do so.

Only quote exact action costs, success chances, or projected gains when they are
present in live state; harmony and buffs can change them dynamically.`;
