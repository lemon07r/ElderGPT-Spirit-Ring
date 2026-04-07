const { zip } = require('zip-a-folder');
const package = require('../package.json');
const path = require('path');
const fs = require('fs');

function buildDistributionManifest() {
  return {
    name: package.name,
    version: package.version,
    description: package.description,
    author: package.author,
    main: 'mod.js',
  };
}

async function zipDist() {
  const distPath = path.resolve(__dirname, `../dist/${package.name}`);
  const buildsDir = path.resolve(__dirname, '../builds');
  // Use just the mod name without version for easier updates
  const zipPath = path.resolve(buildsDir, `${package.name}.zip`);
  const distPackageJsonPath = path.resolve(distPath, 'package.json');

  try {
    // Create builds directory if it doesn't exist
    if (!fs.existsSync(buildsDir)) {
      fs.mkdirSync(buildsDir, { recursive: true });
    }

    fs.writeFileSync(
      distPackageJsonPath,
      `${JSON.stringify(buildDistributionManifest(), null, 2)}\n`,
      'utf8',
    );
    console.log('Wrote distribution package.json to dist folder');

    await zip(distPath, zipPath);
    console.log(`Successfully zipped ${package.name} to ${zipPath}`);
  } catch (err) {
    console.error('Error zipping dist folder:', err);
  }
}

zipDist();
