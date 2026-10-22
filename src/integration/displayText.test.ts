import type { ModAPI, Translatable } from 'afnm-types';
import { asDisplayString } from './displayText';

afterEach(() => { delete (globalThis as Partial<{ window: Window }>).window; });

test('translates plain, deferred, and plural display text through the current language', () => {
  const t = jest.fn(() => 'Translated event');
  (globalThis as typeof globalThis & { window: Window }).window = {
    modAPI: { utils: { t } } as unknown as ModAPI,
  } as Window;
  const plural: Translatable = {
    _translatable: true, _plural: true, countVar: 'count',
    one: 'One day', other: '{count} days', variables: { count: 2 },
  };
  for (const value of ['Event', { _translatable: true, key: 'Event' } as const, plural]) {
    expect(asDisplayString(value)).toBe('Translated event');
    expect(t).toHaveBeenLastCalledWith(value);
  }
});

test('falls back to stable strings when translation is unavailable or throws', () => {
  expect(asDisplayString(undefined, 'Unknown')).toBe('Unknown');
  expect(asDisplayString('Event')).toBe('Event');
  (globalThis as typeof globalThis & { window: Window }).window = {
    modAPI: { utils: { t: () => { throw new Error('not ready'); } } } as unknown as ModAPI,
  } as Window;
  expect(asDisplayString({ _translatable: true, key: 'Event' })).toBe('Event');
  expect(asDisplayString({
    _translatable: true, _plural: true, countVar: 'count',
    one: 'One day', other: 'Days', variables: { count: 1 },
  })).toBe('One day');
});
