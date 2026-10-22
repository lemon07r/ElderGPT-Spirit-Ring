export const COMBAT_KNOWLEDGE = `\
=== COMBAT SYSTEM (AFNM 0.7.17) ===

Combat executes ordered stances. The runtime determines technique-slot capacity
from cultivation realm; the live STANCES section reports the current capacity.
When suggesting a build, respect opener/finisher rules and technique instance
limits shown by the game, and fill available slots only when the player owns
suitable techniques.

Damage, barrier, healing, buffs, technique timing, party members, auto-use
items, and enemy state interact dynamically. Use the live player/enemy stats and
do not claim exact damage without all operands.

Player and enemy health use the unified health system. Cultivator resistance
has been removed: do not apply the old player/enemy health conversion or an
extra cultivator-resistance factor. School resistances and toxicity resistance
are separate stats and still exist. Protection is a raw stat, not a percentage.

Current buff timing supports combat start, round start, before-technique,
after-technique, stack-gain, and end-of-round effects. True, corrupt, disruption,
and normal damage may follow different mitigation paths; avoid reducing those
paths to an unverified one-line formula.

The current combat auto-use loadout uses structured rule blocks and per-slot
limits. It is separate from crafting auto-use.

Tournaments use seeded brackets and placement rewards, with combat and/or
crafting rounds defined by the tournament. Health and between-round pill buffs
can carry forward. Crafting matches compare quality stars, not raw Completion
alone. Do not assume the old participant-pool model or a universal round count.`;
