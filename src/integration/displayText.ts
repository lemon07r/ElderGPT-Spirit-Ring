import type { Translatable } from 'afnm-types';

export function asDisplayString(
  value: Translatable | string | undefined,
  fallback = '',
): string {
  if (value) {
    try {
      const translate =
        typeof window !== 'undefined' ? window.modAPI?.utils?.t : undefined;
      if (translate) {
        const translated = translate(value);
        if (translated?.trim()) return translated;
      }
    } catch {
      // Fall through to the stable translation key or caller fallback.
    }
    if (typeof value === 'string') return value.trim() ? value : fallback;
    if ('key' in value && typeof value.key === 'string') return value.key;
    if ('_plural' in value) {
      return value.variables?.[value.countVar] === 1 ? value.one : value.other;
    }
  }
  return fallback;
}
