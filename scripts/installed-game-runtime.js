#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_GAME_DIR = path.join(
  os.homedir(), '.steam', 'steam', 'steamapps', 'common', 'Ascend From Nine Mountains',
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getGameDir() {
  return process.env.AFNM_GAME_DIR || DEFAULT_GAME_DIR;
}

function getAppAsarPath(gameDir) {
  return path.join(gameDir, 'resources', 'app.asar');
}

function ensureExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    fail(`${description} not found: ${filePath}`);
  }
}

function getCacheFingerprint(asarPath) {
  const stat = fs.statSync(asarPath);
  return `${stat.size}-${Math.trunc(stat.mtimeMs)}`;
}

function getExtractDir(fingerprint) {
  return path.join(os.homedir(), '.local', 'tmp', 'afnm', 'eldergpt', 'runtime', fingerprint);
}

function extractRuntime(asarPath, extractDir) {
  const marker = path.join(extractDir, '.complete');
  if (fs.existsSync(marker)) {
    return extractDir;
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  // Read only inspection sources, not gigabytes of media/native dependencies.
  // Positional reads avoid extractAll's signed 32-bit overflow on large ASARs.
  const fd = fs.openSync(asarPath, 'r');
  try {
    const readAt = (size, position) => {
      const buffer = Buffer.alloc(size);
      let read = 0;
      while (read < size) {
        const count = fs.readSync(fd, buffer, read, size - read, position + read);
        if (!count) throw new Error('Unexpected end of ASAR');
        read += count;
      }
      return buffer;
    };
    const prefix = readAt(16, 0);
    const dataOffset = 8 + prefix.readUInt32LE(4);
    const header = JSON.parse(readAt(prefix.readUInt32LE(12), 16).toString('utf8'));
    const visit = (files, parent = '') => {
      for (const [name, entry] of Object.entries(files)) {
        if (name === '.' || name === '..' || /[/\\]/.test(name)) {
          throw new Error(`Unsafe ASAR entry: ${name}`);
        }
        const relative = parent ? `${parent}/${name}` : name;
        if (entry.files) {
          if (relative === 'dist-electron' || relative.startsWith('dist-electron/')) {
            visit(entry.files, relative);
          }
        } else if (relative === 'package.json' ||
          (relative.startsWith('dist-electron/') && /\.(?:js|cjs|mjs|json|html|ts)$/.test(name))) {
          const destination = path.join(extractDir, relative);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          if (entry.unpacked) {
            fs.copyFileSync(path.join(`${asarPath}.unpacked`, relative), destination);
          } else {
            fs.writeFileSync(destination, readAt(entry.size, dataOffset + Number(entry.offset)));
          }
        }
      }
    };
    visit(header.files);
    fs.writeFileSync(marker, 'inspection sources extracted\n');
  } catch (error) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fail(`Failed to extract installed game runtime from ${asarPath}: ${error.message}`);
  } finally {
    fs.closeSync(fd);
  }

  return extractDir;
}

function readText(filePath) {
  ensureExists(filePath, 'Required extracted runtime file');
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function hasToken(text, token) {
  return text.includes(token);
}

function extractSummary(extractDir, gameDir, asarPath) {
  const packageJsonPath = path.join(extractDir, 'package.json');
  const mainIndexPath = path.join(extractDir, 'dist-electron', 'main', 'index.js');
  const gameJsPath = path.join(extractDir, 'dist-electron', 'Game.js');
  const rendererIndexPath = path.join(extractDir, 'dist-electron', 'index.js');
  const dynamicImportHelperPath = path.join(
    extractDir,
    'dist-electron',
    '_rolldown_dynamic_import_helper.js',
  );

  const packageJson = readJson(packageJsonPath);
  const mainIndex = readText(mainIndexPath);
  const gameJs = readText(gameJsPath);
  const rendererJs = [gameJs, ...[rendererIndexPath, dynamicImportHelperPath]
    .filter((file) => fs.existsSync(file)).map(readText)].join('\n');

  const buildVersion = mainIndex.match(/(?:const|var|let) \w+=[`"'](\d+\.\d+\.\d+-[a-f\d]+)[`"']/)?.[1] ?? null;
  const forgeLowPenalty =
    gameJs.includes('forgeWorks.heat>=2&&t.forgeWorks.heat<=3') ||
    gameJs.includes('forgeWorks.heat>=2&&e.forgeWorks.heat<=3');
  const forgeRecommendFusionThrough4 =
    /recommendedTechniqueTypes=\w+\.forgeWorks\.heat<=4\?\[[`"']fusion[`"']\]/.test(gameJs);

  return {
    gameDir,
    appAsarPath: asarPath,
    extractedDir: extractDir,
    gameVersion: packageJson.version ?? null,
    buildVersion,
    runtimeBehavior: {
      writesRelativeSettingsJson: /=[`"']\.\/settings\.json[`"']/.test(mainIndex),
      supportsDisableSteamSentinel: mainIndex.includes('disable_steam'),
      restartsThroughSteamByDefault: mainIndex.includes(
        'Restarting app through Steam...',
      ),
      disableSteamSentinelPath: path.join(gameDir, 'disable_steam'),
      hasNativeLauncher: fs.existsSync(path.join(gameDir, 'launch-native.sh')),
      hasHostLauncher: fs.existsSync(path.join(gameDir, 'launch-host.sh')),
    },
    forge: {
      lowControlPenaltyHeat: forgeLowPenalty ? [2, 3] : null,
      recommendsFusionThroughHeat: forgeRecommendFusionThrough4 ? 4 : null,
    },
    modApi: {
      hasHarmonyConfigs: gameJs.includes('harmonyConfigs'),
      hasRemovedItemHarmonyMapping: !gameJs.includes('itemTypeToHarmonyType'),
      hasRecipeConditionEffects: gameJs.includes('recipeConditionEffects'),
      hasCraftingTechniques: gameJs.includes('craftingTechniques'),
      hasGetVariablesFromCraftingEntity: gameJs.includes(
        'getVariablesFromCraftingEntity',
      ),
      hasEvaluateCraftingCondition: gameJs.includes(
        'evaluateCraftingCondition',
      ),
      hasInjectUI: hasToken(gameJs, 'injectUI:'),
      hasSubscribe: hasToken(gameJs, 'subscribe:e=>'),
      hasGetGameStateSnapshot: hasToken(gameJs, 'getGameStateSnapshot:'),
      hasOnEventDropItem: hasToken(gameJs, 'onEventDropItem'),
      hasOnGenerateExploreEvents: hasToken(gameJs, 'onGenerateExploreEvents'),
      hasOnCalculateDamage: hasToken(gameJs, 'onCalculateDamage'),
      hasOnLocationEnter: hasToken(gameJs, 'onLocationEnter'),
      hasOnLootDrop: hasToken(gameJs, 'onLootDrop'),
      hasOnAdvanceDay: hasToken(gameJs, 'onAdvanceDay'),
      hasOnAdvanceMonth: hasToken(gameJs, 'onAdvanceMonth'),
      hasOnBeforeCombat: hasToken(gameJs, 'onBeforeCombat'),
      hasOnReduxAction: hasToken(gameJs, 'onReduxAction'),
      hasHarmonyAugment: gameJs.includes('harmonyAugment'),
      hasGetFullItem: gameJs.includes('getFullItem'),
      hasCraftingAutoUse: gameJs.includes('currentCraftingAutoUseLoadout'),
      hasResearchState:
        gameJs.includes('research') && gameJs.includes('glyphs'),
      hasSoulShardDelveRun: gameJs.includes('soulShardDelve'),
      hasExpeditionTiles: gameJs.includes('expeditionTiles'),
      hasMysticalRegionDefinitions: gameJs.includes(
        'mysticalRegionDefinitions',
      ),
      hasBuffStatFilter:
        rendererJs.includes('interceptBuffEffects') &&
        rendererJs.includes('statFilter'),
      hasGlobalBuffRegistry:
        /buffs:[^,]{1,100},techniqueBuffs:/.test(gameJs),
      hasCoreFormationAltarStats: gameJs.includes(
        'getCoreFormationAltarStats',
      ),
      hasSectState: gameJs.includes('populationTarget:') && gameJs.includes('authoredMembers:'),
      hasFocusedQuest: gameJs.includes('focusedQuest'),
      hasTournamentConfigs: gameJs.includes('tournamentConfigs:'),
      hasCaptivatingCadence: gameJs.includes('name:`Captivating Cadence`'),
      hasReturningCycle: gameJs.includes('name:`Returning Cycle`'),
      hasSplitCraftingCosts: ['qiCostReduction', 'qiCostPenalty', 'stabilityCostReduction', 'stabilityCostPenalty']
        .every((stat) => gameJs.includes(`${stat}:0`)),
    },
    ui: {
      hasCombatVictoryDialog: gameJs.includes('id:`combat-victory`'),
      hasCombatVictoryAssertiveTarget:
        /id:`combat-victory`[\s\S]{0,400}"aria-live":`assertive`/.test(gameJs),
      hasReactGlobals: gameJs.includes('window.React=') && gameJs.includes('window.ReactDOM='),
      hasCreateRoot: rendererJs.includes('createRoot'),
    },
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/installed-game-runtime.js summary
  node scripts/installed-game-runtime.js extract
  node scripts/installed-game-runtime.js path
  node scripts/installed-game-runtime.js grep <pattern>

Environment:
  AFNM_GAME_DIR=/absolute/path/to/Ascend From Nine Mountains`);
}

function main() {
  const command = process.argv[2] || 'summary';
  const pattern = process.argv[3];
  const gameDir = getGameDir();
  const asarPath = getAppAsarPath(gameDir);
  ensureExists(gameDir, 'Installed game directory');
  ensureExists(asarPath, 'Installed app.asar');

  const extractDir = extractRuntime(asarPath, getExtractDir(getCacheFingerprint(asarPath)));

  switch (command) {
    case 'summary': {
      const summary = extractSummary(extractDir, gameDir, asarPath);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    case 'extract':
    case 'path': {
      console.log(extractDir);
      return;
    }
    case 'grep': {
      if (!pattern) {
        fail('Missing grep pattern.');
      }
      const result = childProcess.spawnSync(
        'rg',
        ['-n', '-o', '--max-columns', '1200', pattern, path.join(extractDir, 'dist-electron')],
        {
          cwd: ROOT,
          stdio: 'inherit',
        },
      );
      process.exit(result.status ?? 1);
    }
    case 'help':
    case '--help':
    case '-h': {
      printUsage();
      return;
    }
    default:
      fail(`Unknown command: ${command}`);
  }
}

if (require.main === module) main();

module.exports = { extractRuntime, extractSummary };
