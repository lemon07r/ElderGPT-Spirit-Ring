import React from 'react';

const OPEN_EVENT = 'eldergpt:open';

export function openSpiritRing() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function subscribeToSpiritRingOpen(listener: () => void): () => void {
  const handleOpen = () => listener();
  window.addEventListener(OPEN_EVENT, handleOpen);
  return () => window.removeEventListener(OPEN_EVENT, handleOpen);
}

export function registerModApiUiHooks() {
  if (window.__elderGptUiHooksRegistered || !window.modAPI?.injectUI) {
    return;
  }

  window.__elderGptUiHooksRegistered = true;

  window.modAPI.injectUI('combat-victory', (api, _element, inject) =>
    inject(
      '[aria-live="assertive"]',
      <api.components.GameButton onClick={openSpiritRing}>
        Consult Spirit Ring
      </api.components.GameButton>,
      'inline',
    ),
  );
}
