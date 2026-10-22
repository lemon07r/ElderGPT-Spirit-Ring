import React from 'react';
import type { ModAPI, ModReduxAPI } from 'afnm-types';
import { openSpiritRing, registerModApiUiHooks } from './uiBridge';

afterEach(() => { delete (globalThis as Partial<{ window: Window }>).window; });

test('registers the runtime-verified victory selector once and opens the shared overlay', () => {
  const injectUI = jest.fn();
  (globalThis as typeof globalThis & { window: Window }).window = {
    modAPI: { injectUI } as unknown as ModAPI,
  } as Window;
  registerModApiUiHooks();
  registerModApiUiHooks();
  expect(injectUI).toHaveBeenCalledTimes(1);
  expect(injectUI.mock.calls[0][0]).toBe('combat-victory');
  const inject = jest.fn();
  const api = { components: { GameButton: () => null } } as unknown as ModReduxAPI;
  injectUI.mock.calls[0][1](api, inject);
  expect(inject).toHaveBeenCalledWith('[aria-live="assertive"]', expect.anything(), 'after');
  const button = inject.mock.calls[0][1] as React.ReactElement<{ onClick: () => void; children: string }>;
  expect(button.props.onClick).toBe(openSpiritRing);
  expect(button.props.children).toBe('Consult Spirit Ring');
});
