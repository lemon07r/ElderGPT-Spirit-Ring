export const CRAFTING_KNOWLEDGE = `\
=== CRAFTING SYSTEM ===

Action-based crafting with Qi management. Each action consumes Qi Pool and may affect Stability.

CORE STATS:
- Qi Intensity: Drives completion (how finished the item is)
- Qi Control: Drives perfection (quality of the item)
- Stability: Remaining durability; hitting 0 fails the craft
- Toxicity: Accumulates from reagents/pills; too high is dangerous
- Qi Pool: Resource spent on each action

CRITICAL RULE - BUFF EVALUATION ORDER:
Percentage buffs only scale BASE stats (Base + Cauldron + Flame). Flat buffs from Reagents/Pills are added AFTER percentages. Example: Base 944 x 1.5 = 1416, then +301 flat = 1717. NOT (944+301) x 1.5.

FOUR TECHNIQUE TYPES:
- Fusion: Increases completion via Qi Intensity
- Refine: Increases perfection via Qi Control
- Stabilize: Restores stability
- Support: Applies buffs, utility effects

COMPLETION/PERFECTION:
Uses nonlinear exponential ladder (factor 1.3). Each guaranteed bonus requires exponentially more stat. Sublime crafting can push beyond 100% (up to 600%+). Artefacts need 200%+ completion for Sublime status.

CONSUMABLES:
- Pills: Temporary buff stacks (decrement per action). Cheap, limited duration.
- Reagents: Permanent buff for the session. High toxicity cost.
- Detoxifying Pill for Qi regen: Purple ~15.7 Qi/turn, Red ~32.3 Qi/turn

CONDITION SYSTEM:
5 states based on harmony value:
- Balanced (neutral): No bonuses
- Harmonious (positive): Condition-specific bonuses
- Resistant (negative): Penalties
- Brilliant (very positive): Strong bonuses
- Corrupted (very negative): Strong penalties
6 recipe condition types: Perfectable, Fuseable, Flowing, Energised, Stable, Fortuitous

MAX STABILITY DECAY: -1 per action unless using techniques with noMaxStabilityLoss flag (Focus, Minute Repairs).

SUBLIME CRAFTING (unlocked at 200 Craft Skill):
Four harmony minigames depending on recipe type:

1. SPIRITUAL RESONANCE (Elixirs, Pills, Reagents):
   Chain same action type. Breaking chain = -3 Stability and -Harmony. Two consecutive different actions change target color.

2. ALCHEMICAL ARTS:
   Every 3 actions checked as a combo. 6 valid combos (order irrelevant within the trio). Invalid combo = -20 Harmony, -25% Control debuff.

3. FORGE WORKS (Cauldrons, Artefacts):
   Heat gauge 0-10. Sweet spot 4-6 = +50% Control & Intensity. Heat 0 = -1000% Control. Heat 10 = -1000% Intensity. Fusion adds +2 heat, others -1.

4. INSCRIBED PATTERNS (Clothing, Talismans):
   5-slot pattern wheel. Must use lit slot color. Invalid = lose Qi Pool, Stability, AND HALF of all buff stacks. Valid = +2% Intensity & Control per stack (strongest scaling buff).

KEY SYNERGIES:
- Efficient Fusion: -50% Qi cost on next action. Use before expensive actions.
- Stabilizing Refinement: -50% Stability cost on next action. Use before risky actions.
- Golden Path Peaks: 1st = +7 Qi on Refine, 2nd = +5 Stability on Stabilize, 3rd = +Perfection on Support, 4th = +15% Control per 100% Completion
- Focus loop: Focused Recirculation (0 Qi, restores up to 50 Qi). Focused Stabilization restores max stability.
- Insight loop: Buffs Control but increases Qi cost. Cash out with Insightful Restoration (+20 Qi per stack).
- Pressure: Slow ramping +Intensity/+Control but increases Stability cost.

DIFFICULTY SCALING:
Difficulty multipliers: easy=1, medium=1.4, hard=1.5, veryhard=1.7, veryhard+=2.75, extreme=3.7
Realm multipliers: mundane=0.9 up to soulAscension=9.0`;
