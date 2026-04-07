import { initUI } from '../ui/index';
import { getGameStateSource } from './gameState';
import { registerProactiveHooks } from './proactive';
import { registerModApiUiHooks } from './uiBridge';

const MOD_TAG = '[ElderGPT]';

function initializeMod() {
  if (window.__elderGptInstalled) {
    console.log(MOD_TAG, 'Already installed.');
    return;
  }

  window.__elderGptInstalled = true;
  console.log(MOD_TAG, 'Initializing Spirit Ring...');
  console.log(MOD_TAG, `Using ${getGameStateSource()} for read-only game context.`);

  initUI();
  registerModApiUiHooks();
  registerProactiveHooks();
}

initializeMod();
