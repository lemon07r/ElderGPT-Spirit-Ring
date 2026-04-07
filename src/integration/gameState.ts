import type { RootState } from 'afnm-types';

const MOD_TAG = '[ElderGPT]';

export type GameStateSource = 'modapi-snapshot' | 'redux-store' | 'unavailable';

function warn(label: string, error: unknown) {
  console.warn(`${MOD_TAG} ${label}`, error);
}

export function getGameStateSource(): GameStateSource {
  if (typeof window === 'undefined') {
    return 'unavailable';
  }

  if (typeof window.modAPI?.getGameStateSnapshot === 'function') {
    return 'modapi-snapshot';
  }

  if (window.gameStore?.getState) {
    return 'redux-store';
  }

  return 'unavailable';
}

export function readGameStateSnapshot(): RootState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (typeof window.modAPI?.getGameStateSnapshot === 'function') {
      return window.modAPI.getGameStateSnapshot();
    }
  } catch (error) {
    warn('modAPI.getGameStateSnapshot failed', error);
  }

  try {
    return window.gameStore?.getState() ?? null;
  } catch (error) {
    warn('window.gameStore.getState failed', error);
    return null;
  }
}

export function subscribeToGameState(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  try {
    if (typeof window.modAPI?.subscribe === 'function') {
      return window.modAPI.subscribe(listener);
    }
  } catch (error) {
    warn('modAPI.subscribe failed', error);
  }

  try {
    return window.gameStore?.subscribe(listener) ?? (() => {});
  } catch (error) {
    warn('window.gameStore.subscribe failed', error);
    return () => {};
  }
}
