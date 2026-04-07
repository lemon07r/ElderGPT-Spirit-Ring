import type { ModMetadata } from 'afnm-types';
import { GAME_VERSION } from 'afnm-types';
import './integration/index';

declare const MOD_METADATA: Omit<ModMetadata, 'gameVersion'>;

export default {
  getMetadata: (): ModMetadata => ({
    ...MOD_METADATA,
    gameVersion: GAME_VERSION,
  }),
};
