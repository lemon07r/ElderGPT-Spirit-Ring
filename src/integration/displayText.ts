import type { Translatable } from 'afnm-types';

export function asDisplayString(
  value: Translatable | string | undefined,
  fallback = '',
): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
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
    if ('key' in value && typeof value.key === 'string') return value.key;
  }
  return fallback;
}
