import type { ModAPI, RootState } from 'afnm-types';

declare global {
  interface Window {
    modAPI?: ModAPI;
    gameStore?: {
      dispatch: (action: unknown) => unknown;
      getState: () => RootState;
      subscribe: (listener: () => void) => () => void;
    };
    React?: any;
    ReactDOM?: any;
    MaterialUI?: any;
    MaterialUIIcons?: any;
    __elderGptInstalled?: boolean;
    __elderGptUiHooksRegistered?: boolean;
  }
}

export {};
