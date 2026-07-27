import type { ModMetadata } from 'afnm-types';
import './integration/index';

declare const MOD_METADATA: ModMetadata;

export default {
  getMetadata: (): ModMetadata => MOD_METADATA,
};
