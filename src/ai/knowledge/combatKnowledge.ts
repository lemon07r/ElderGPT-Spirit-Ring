export const COMBAT_KNOWLEDGE = `\
=== COMBAT SYSTEM (AFNM 0.7.6) ===

Combat executes ordered stances. The runtime determines technique-slot capacity
from cultivation realm; the live STANCES section reports the current capacity.
When suggesting a build, respect opener/finisher rules and technique instance
limits shown by the game, and fill available slots only when the player owns
suitable techniques.

Damage, barrier, healing, buffs, technique timing, party members, auto-use
items, and enemy state interact dynamically. Use the live player/enemy stats and
do not claim exact damage without all operands.

Current buff timing supports combat start, round start, before-technique,
after-technique, stack-gain, and end-of-round effects. True, corrupt, disruption,
and normal damage may follow different mitigation paths; avoid reducing those
paths to an unverified one-line formula.

The current combat auto-use loadout uses structured rule blocks and per-slot
limits. It is separate from crafting auto-use.`;
