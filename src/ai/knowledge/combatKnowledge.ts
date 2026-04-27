export const COMBAT_KNOWLEDGE = `\
=== COMBAT SYSTEM ===

Turn-based stance combat. Each turn the player chooses techniques from their equipped stances.

STANCE MECHANICS:
- Each stance is an ordered sequence of technique slots executed in order each turn
- Technique slots per stance increase with cultivation realm (e.g. 3 at Body Forging, up to 5+ at higher realms)
- The player's current max slots per stance are shown in the STANCES section of the game state
- When recommending stance builds, ALWAYS fill all available technique slots
- The number of stances a player can create is governed by the Battlesense social stat
- Some techniques are restricted to opener (first) or finisher (last) positions in a stance
- Each technique has a max instance limit per stance (default 3)

SIX CULTIVATION SCHOOLS:
- Celestial: Sun/moon duality, attunement buffs, balanced offense/defense
- Blood: Life force manipulation, risk/reward (stronger at low HP), corruption mechanics
- Blossom: Nature/healing, sustained regeneration, poison/thorns
- Fist: Martial arts, momentum stacks, high burst damage
- Weapon: Tool-based combat, metal element, progressive momentum
- Cloud: Storm/weather, area effects, disruption

DAMAGE TYPES:
- Normal: Reduced by barrier and defense
- True: Ignores barrier AND defense (very dangerous)
- Corrupt: Ignores defense only
- Disruption: Only damages barrier (used to strip defenses)

TECHNIQUE MECHANICS:
- Techniques cost buff stacks, toxicity, or droplets
- Mastery tiers (Mundane through Transcendent) improve technique stats
- Conditional effects trigger based on buff stacks, HP thresholds, or custom conditions
- Critical hits possible; excess crit chance above 100% converts to bonus multiplier at 1:3 ratio

BUFF TRIGGER PHASES:
- On Combat Start: fires once at the beginning of combat
- On Round Start: fires at the start of each round before techniques
- Before Technique: fires before each technique use
- After Technique: fires after each technique use
- On Stack Gain: fires when a buff gains stacks
- End of Round: fires at the end of each round after all techniques

ENEMY MODIFIERS:
- Alpha: Stronger than normal enemies
- Alpha+: Significantly stronger
- Realmbreaker: Fights above their realm level
- Corrupted: Special corruption mechanics

TACTICAL ADVICE PRINCIPLES:
- Match school strengths against enemy weaknesses
- Build buff stacks before using finisher techniques
- Barrier-heavy enemies need Disruption damage first
- Spar fights (non-lethal) are for training, not resource gain
- Consider retreat if HP drops below 30% against non-spar enemies
- When building stances, use ALL available technique slots for the player's realm`;
