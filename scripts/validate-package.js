const { execFileSync } = require('child_process');
const path = require('path');
const packageJson = require('../package.json');

const zipPath = path.resolve(
  __dirname,
  '..',
  'builds',
  `${packageJson.name}.zip`,
);
const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  .trim()
  .split('\n');
const find = (name) => entries.find((entry) => entry.endsWith(name));
const packageEntry = find('package.json');
const modEntry = find('mod.js');
if (!packageEntry || !modEntry) throw new Error('ZIP missing package.json/mod.js');
const manifest = JSON.parse(
  execFileSync('unzip', ['-p', zipPath, packageEntry], { encoding: 'utf8' }),
);
const bundle = execFileSync('unzip', ['-p', zipPath, modEntry], {
  encoding: 'utf8',
});
if (manifest.version !== '0.9.0' || manifest.gameVersion !== '0.7.6') {
  throw new Error('ZIP metadata does not target ElderGPT 0.9.0 / AFNM 0.7.6');
}
if (bundle.includes('node_modules/afnm-types') || bundle.includes('GAME_VERSION')) {
  throw new Error('Bundle contains runtime afnm-types JavaScript');
}
console.log(`Validated ${path.basename(zipPath)} (${entries.length} files)`);
