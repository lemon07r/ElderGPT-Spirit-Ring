import type { Item, ItemDesc, RecipeHarmonyType, Translatable } from 'afnm-types';
import type { EquipmentPiece } from './contextTypes';

function asString(value: Translatable | string | undefined): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'key' in value) return value.key;
  return '';
}

function nonZeroMap(
  source: Record<string, unknown> | undefined,
): Record<string, number> | null {
  if (!source) return null;
  const entries = Object.entries(source).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && entry[1] !== 0,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function resolveFullItem(
  desc: ItemDesc,
  db: Record<string, Item> | null,
): Item | null {
  try {
    const resolver = window.modAPI?.utils?.getFullItem;
    if (resolver) return resolver(desc);
  } catch {
    // The static registry is the read-only fallback for incomplete runtimes.
  }
  return db?.[desc.name] ?? null;
}

export function buildEquipmentPiece(
  slot: string,
  desc: ItemDesc | undefined,
  db: Record<string, Item> | null,
): EquipmentPiece | null {
  if (!desc?.name) return null;
  const full = resolveFullItem(desc, db);
  const record = full as unknown as Record<string, unknown> | null;
  const stats = {
    ...((record?.stats as Record<string, unknown> | undefined) ?? {}),
    ...((record?.combatStats as Record<string, unknown> | undefined) ?? {}),
  };
  const buffs =
    (
      record?.buffs as
        | Array<{ buff?: { name?: string; displayName?: Translatable } }>
        | undefined
    )
      ?.map((entry) =>
        asString(entry.buff?.displayName ?? entry.buff?.name),
      )
      .filter(Boolean) ?? [];
  const extras: Record<string, string | number> = {};
  for (const key of [
    'charisma',
    'qiAbsorption',
    'speed',
    'qi',
    'masteryPoints',
  ]) {
    const value = record?.[key];
    if (typeof value === 'number' && value !== 0) extras[key] = value;
  }
  if (full?.rarity) extras.rarity = full.rarity;
  if (full?.realm && full.realm !== 'any') extras.realm = full.realm;
  const augment = full?.harmonyAugment ?? desc.harmonyAugment;

  return {
    slot,
    name: desc.name,
    enchantment: desc.enchantment?.kind ?? null,
    harmonyType: (augment?.type as RecipeHarmonyType | undefined) ?? null,
    harmonyQuality: augment?.quality ?? null,
    stats: nonZeroMap(stats),
    buffs,
    extras,
  };
}
