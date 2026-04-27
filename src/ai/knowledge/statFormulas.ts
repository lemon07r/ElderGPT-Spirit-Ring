export const STAT_FORMULAS = `\
=== STAT SCALING FORMULAS ===

These are the actual game constants from AFNM's source code:

PHYSICAL STAT SCALING (base stat number = 10):
- HP per Flesh point: 1,000
- Power per Muscles point: 100
- Defense per Flesh point: 100
- Toxicity resistance per Digestion point: 10
- Qi Pool per Dantian point: 18
- Control per Meridians point: 1
- Intensity per Muscles point: 1
- Comprehension per Dantian point: 10
- Artefact Power per Meridians point: 100
- Barrier per Dantian point: 1,000
- Base Qi per Breakthrough: 1,000

COMBAT STATS (from CombatStatsMap):
- maxhp / hp: Health points
- maxbarrier / barrier: Damage absorption shield
- power: Base damage output
- artefactpower: Damage from artefact techniques
- defense: Reduces incoming normal damage
- protection: Additional damage reduction layer
- dr: Damage Reduction percentage (flat % reduction of incoming damage)
- barrierMitigation: Reduces damage to barrier
- critchance: Critical hit chance (excess above 100% converts to bonus multiplier at 1:3 ratio)
- critmultiplier: Critical hit damage multiplier
- lifesteal: Heals on dealing damage
- vulnerability: Increases damage taken
- weakness: Additional damage taken modifier
- damageBoost: Multiplier on all outgoing damage
- healingBoost: Multiplier on healing received
- barrierBoost: Multiplier on barrier generation
- School boosts (fistBoost, blossomBoost, weaponBoost, cloudBoost, bloodBoost, celestialBoost): Per-school damage multipliers
- School resistances (fistResistance, etc.): Reduces damage from specific schools

CRAFTING STATS (from CraftingStatsMap):
- maxpool / pool: Qi Pool for crafting actions
- control: Drives perfection quality
- intensity: Drives completion progress
- critchance / critmultiplier: Crafting critical hits
- resistance: Toxicity resistance
- itemEffectiveness: Multiplier for pill/reagent effects
- poolCostPercentage / poolCostFlat: Modifies Qi cost of actions
- stabilityCostPercentage: Modifies stability cost of actions
- successChanceBonus: Bonus to action success chance

DIFFICULTY MULTIPLIERS:
- Realm multipliers: mundane=0.9, bodyForging=1.0, meridianOpening=1.2, qiCondensation=1.5, coreFormation=2.0, pillarCreation=2.7, lifeFlourishing=3.5, worldShaping=4.5, innerGenesis=6.0, soulAscension=9.0
- Recipe difficulty multipliers: easy=1, medium=1.4, hard=1.5, veryhard=1.7, veryhard+=2.75, extreme=3.7

SOCIAL STAT EFFECTS:
- Battlesense: Number of stances the player can create, stance-switch power bonus
- Craftskill: Qi Control and Qi Intensity bonus for crafting
- Charisma: Presence and shop prices
- Artefact Slots: Number of equippable artefacts
- Talisman Slots: Number of equippable talismans
- Condense Efficiency: Qi to Qi Droplet conversion rate
- Pills Per Round: Items usable per combat round

REPUTATION TIERS:
- neutral (0), friendly (5), respected (10), honoured (15), revered (20), exalted (25)
- 5 reputation points per tier`;
