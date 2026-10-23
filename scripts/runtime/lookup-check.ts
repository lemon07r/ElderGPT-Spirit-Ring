import path from 'node:path';
import os from 'node:os';
import { mkdir } from 'node:fs/promises';

const project = path.resolve(import.meta.dir, '../..');
const output = path.join(os.homedir(), '.local/tmp/eldergpt-runtime');
const browserTmp = path.join(output, 'browser-tmp');
await mkdir(browserTmp, { recursive: true });
process.env.TMPDIR = browserTmp;
const extraction = Bun.spawnSync(['bun', 'scripts/installed-game-runtime.js', 'path'], { cwd: project });
if (extraction.exitCode) throw new Error(extraction.stderr.toString());
const root = path.join(extraction.stdout.toString().trim(), 'dist-electron');
const metadata = Bun.spawnSync(['bun', 'scripts/installed-game-runtime.js', 'summary'], { cwd: project });
if (metadata.exitCode) throw new Error(metadata.stderr.toString());
const summary = JSON.parse(metadata.stdout.toString());
const playerOnly = process.argv.includes('--player-only');
const tryPlayer = process.argv.includes('--player') || playerOnly;
// Build-pinned scratch instrumentation, resolved from the real New Game UI
// handler. Never rewrite the extracted file or replace game initialization.
const playerSupported = summary.buildVersion === '0.7.17-d8ae6ce';
const playerHook = `\nwindow.__runtimeCreatePlayer=()=>window.gameStore.dispatch(zLu({newGame:{...window.gameStore.getState().newGame,forename:'Runtime',surname:'Probe'},startingStats:WLu,backgrounds:[],selectedStart:BLu,skipTutorial:false}));
window.__runtimeSeedItem=()=>window.gameStore.dispatch(L$({name:'Festival Dumpling Ingredients',stacks:3}));\n`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? path.join(os.homedir(), '.bun/install/global/node_modules/playwright/index.mjs'));
const bundle = await Bun.build({ entrypoints: [path.join(project, 'scripts/runtime/lookup-browser.ts')], target: 'browser' });
if (!bundle.success) throw new Error(String(bundle.logs));
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + '/') || !/\.(js|css|html)$/.test(file)) return new Response('', { status: 404 });
  const data = Bun.file(file);
  if (tryPlayer && playerSupported && relative === 'Game.js') {
    return new Response(await data.text() + playerHook, { headers: { 'Content-Type': 'text/javascript' } });
  }
  return await data.exists() ? new Response(data) : new Response('', { status: 404 });
} });
let browser;
const failures: string[] = [];
const checkPlayable = async (page: any) => {
  const playable = playerSupported ? await page.evaluate(() => {
    const w = window as any;
    w.__runtimeCreatePlayer();
    // Explicit sandbox fixture, not a claim about normal starting inventory.
    w.__runtimeSeedItem();
    const state = w.modAPI.getGameStateSnapshot();
    return { created: state.newGame.characterCreated, name: state.player.player.forename,
      known: state.player.player.knownTechniques.length, seededItem: 'Festival Dumpling Ingredients x3',
      result: w.__elderRuntime.player(), unstubbed: w.__unstubbed };
  }) : { skipped: `No inspected New Game hook for ${summary.buildVersion}` };
  await Bun.write(path.join(output, 'playable.json'), JSON.stringify(playable, null, 2));
  if ('result' in playable) failures.push(...playable.result.failures);
  if ('unstubbed' in playable) failures.push(...playable.unstubbed);
  if ('result' in playable && (!playable.result.calls[0].text.includes('Festival Dumpling Ingredients x3')
    || !playable.result.text.includes('Runtime Probe'))) failures.push('sandbox inventory/context not resolved');
  if ('created' in playable && !playable.created) failures.push('New Game thunk did not create a character');
  console.log('Playable:', 'created' in playable ? `${playable.created}; ${playable.known} known techniques` : playable.skipped);
};
try {
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  for (const language of playerOnly ? ['en'] : ['en', 'de']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const blocked = new Set<string>();
      await context.route('**/*', (route: any) => {
        if (route.request().url().startsWith(origin + '/')) return route.continue();
        blocked.add(new URL(route.request().url()).origin);
        return route.abort();
      });
      await context.addInitScript(({ language, version }: { language: string; version: string }) => {
        const w = window as any;
        w.__ipc = [];
        w.__unstubbed = [];
        // Every method is in-memory only. No Electron/preload/native bridge exists.
        const methods = (name: string, values: Record<string, unknown>) => new Proxy({}, { get(_target, key) {
          return async () => {
            const label = `${name}.${String(key)}`;
            w.__ipc.push(label);
            if (!(String(key) in values)) { w.__unstubbed.push(label); throw new Error(`Unstubbed IPC ${label}`); }
            return values[String(key)];
          };
        } });
        w.app = methods('app', { getVersion: version, getIsDev: false, getDevOverride: false, getFullscreen: false, getResolution: '1920x1080', setDiscordActivity: false });
        w.electronAPI = { invoke: async (channel: string) => {
          w.__ipc.push(channel);
          if (channel === 'getSystemLocale') return language;
          if (channel.startsWith('steam:')) return channel.includes('getSubscribedItems') ? [] : false;
          w.__unstubbed.push(channel);
          throw new Error(`Unstubbed channel ${channel}`);
        } };
        w.mainApi = { send() {}, receive() {} };
        w.myFS = methods('myFS', {
          readMods: ['runtime-probe.zip'], fileExists: false, readGlobalModFlags: {}, readCacheFile: null, writeCacheFile: true,
          readStickyState: JSON.stringify({ GameLanguage: language, languageManuallySet: true }), writeStickyState: true,
          extractMod: { success: true, extractedPath: 'runtime-probe' },
          readModContent: { success: true, folder: 'runtime-probe', content: 'window.AFNMMod={getMetadata:()=>({name:"Runtime Probe",version:"0.0.0",gameVersion:"0.7.17"})};' },
          readModTranslations: { success: true, translations: [] }, cleanupUnusedModFolders: true,
          listSaves: [], discoverSaveBackupFolders: [], readFighterImports: [], writeError: false,
        });
      }, { language, version: summary.buildVersion ?? summary.gameVersion });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'load', timeout: 60_000 });
      await page.getByText(/^(continue|weiter|fortfahren)$/i).first().click({ timeout: 30_000 });
      await page.waitForFunction(() => !!(window as any).modAPI?.gameData?.quests, { timeout: 30_000 });
      // Wait for the actual translation module, not merely the selected locale.
      if (language !== 'en') await page.waitForFunction(() => (window as any).modAPI.utils.t('New Game') !== 'New Game', { timeout: 30_000 });
      await page.addScriptTag({ content: await bundle.outputs[0].text(), type: 'module' });
      await page.waitForFunction(() => !!(window as any).__elderRuntime);
      if (playerOnly) { await checkPlayable(page); continue; }
      const result = await page.evaluate((language: string) => {
        const w = window as any;
        const before = JSON.stringify(w.modAPI.getGameStateSnapshot());
        const audit = w.__elderRuntime.audit(language === 'en' ? undefined : ['items', 'techniques', 'locations']);
        const player = w.__elderRuntime.player();
        const sources = language === 'en' ? w.__elderRuntime.sources() : [];
        return { audit, player, sources, readOnly: before === JSON.stringify(w.modAPI.getGameStateSnapshot()),
          localeProof: w.modAPI.utils.t('New Game'), ipc: [...new Set(w.__ipc)], unstubbed: w.__unstubbed };
      }, language);
      await Bun.write(path.join(output, `${language}-audit.json`), JSON.stringify({ game: summary.buildVersion, language, ...result, errors, blocked: [...blocked] }, null, 2));
      for (const row of result.audit) {
        const calls = row.calls.flatMap((call: any) => [call.search, call.byName, call.get]);
        console.log(`${language} ${row.category}: ${row.count} entries; ${row.calls.length} checked; max ${Math.max(0, ...calls.map((call: any) => call.size))} chars / ${Math.max(0, ...calls.map((call: any) => call.ms)).toFixed(1)} ms`);
        for (const call of row.calls) for (const failure of call.failures) failures.push(`${language} ${row.category}/${call.key}: ${failure}`);
        if (!row.count && row.category !== 'mystical_regions') failures.push(`${row.category}: unexpectedly empty`);
      }
      failures.push(...result.player.failures, ...result.unstubbed);
      for (const source of result.sources) failures.push(...source.failures.map((failure: string) => `${source.item}: ${failure}`));
      console.log(`${language} Sources: ${result.sources.length} compared; player: ${result.player.failures.length ? 'FAIL' : 'PASS'}`);
      if (!result.readOnly) failures.push('lookup mutated snapshot');
      if (language === 'en' && tryPlayer) {
        await checkPlayable(page);
      }
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  server.stop(true);
}
console.log(`Reports: ${output}`);
if (failures.length) throw new Error(failures.join('\n'));
console.log('PASS: runtime lookup assertions');
