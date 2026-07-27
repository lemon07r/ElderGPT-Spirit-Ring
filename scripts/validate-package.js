const path = require('path');
const packageJson = require('../package.json');
const { readAfnmGameVersion } = require('./mod-package');
const { readZipFiles } = require('./read-zip');

const zipPath = path.resolve(
  __dirname,
  '..',
  'builds',
  `${packageJson.name}.zip`,
);

async function main() {
  const { entries, files } = await readZipFiles(zipPath, [
    'package.json',
    'mod.js',
  ]);
  const find = (name) => entries.find((entry) => entry.endsWith(name));
  const packageEntry = find('package.json');
  const modEntry = find('mod.js');
  if (!packageEntry || !modEntry) {
    throw new Error('ZIP missing package.json/mod.js');
  }

  const manifest = JSON.parse(files.get(packageEntry));
  const bundle = files.get(modEntry);
  const expectedGameVersion = readAfnmGameVersion();
  if (
    manifest.version !== packageJson.version ||
    manifest.gameVersion !== expectedGameVersion
  ) {
    throw new Error(
      `ZIP metadata mismatch: expected ${packageJson.version} / AFNM ${expectedGameVersion}, received ${manifest.version} / AFNM ${manifest.gameVersion}`,
    );
  }
  if (
    bundle.includes('node_modules/afnm-types') ||
    bundle.includes('GAME_VERSION')
  ) {
    throw new Error('Bundle contains runtime afnm-types JavaScript');
  }
  console.log(
    `Validated ${path.basename(zipPath)} (${entries.length} files)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
