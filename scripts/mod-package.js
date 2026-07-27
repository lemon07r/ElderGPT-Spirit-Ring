const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const versionFile = path.resolve(
  __dirname,
  '..',
  'node_modules/afnm-types/dist/gameVersion.js',
);

function readAfnmGameVersion() {
  const match = fs
    .readFileSync(versionFile, 'utf8')
    .match(/GAME_VERSION\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error(`Unable to read AFNM version from ${versionFile}`);
  return match[1];
}

function buildMetadata() {
  return {
    name: packageJson.name,
    version: packageJson.version,
    author: packageJson.author,
    description: packageJson.description,
    gameVersion: readAfnmGameVersion(),
  };
}

module.exports = { packageJson, readAfnmGameVersion, buildMetadata };
