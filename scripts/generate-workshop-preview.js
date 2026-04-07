#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.resolve(repoRoot, 'docs', 'assets', 'workshop-preview.svg');
const outputPath = path.resolve(repoRoot, 'docs', 'assets', 'workshop-preview.png');

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  return result.status === 0;
}

function hasRenderableOutput(filePath) {
  try {
    return fs.statSync(filePath).size > 0;
  } catch (_error) {
    return false;
  }
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source SVG not found: ${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const renderedWithRsvg = run('rsvg-convert', [
    '-w',
    '512',
    '-h',
    '512',
    '-o',
    outputPath,
    sourcePath,
  ]);

  const rendered =
    (renderedWithRsvg && hasRenderableOutput(outputPath)) ||
    run('magick', [sourcePath, '-resize', '512x512', outputPath]);

  if (!rendered || !hasRenderableOutput(outputPath)) {
    throw new Error('Failed to render workshop preview PNG.');
  }

  console.log(`Wrote workshop preview to ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
