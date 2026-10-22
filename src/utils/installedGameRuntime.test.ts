import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { extractRuntime } = require('../../scripts/installed-game-runtime');

test('runtime inspection extracts source files past 2 GiB without media or npx', () => {
  const scratch = path.join(os.homedir(), '.local', 'tmp', 'afnm', 'eldergpt');
  fs.mkdirSync(scratch, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratch, 'asar-test-'));
  try {
    const asar = path.join(directory, 'app.asar');
    const source = '{"version":"0.7.17-test"}';
    const offset = 2 ** 31 + 128;
    const header = Buffer.from(JSON.stringify({ files: {
      'package.json': { size: Buffer.byteLength(source), offset: String(offset) },
      'movie.webm': { size: 4, offset: '0' },
      'dist-electron': { files: { 'Game.js': { size: 4, offset: '0' } } },
    } }));
    const prefix = Buffer.alloc(16);
    prefix.writeUInt32LE(4, 0);
    prefix.writeUInt32LE(header.length + 8, 4);
    prefix.writeUInt32LE(header.length + 4, 8);
    prefix.writeUInt32LE(header.length, 12);
    const dataOffset = prefix.length + header.length;
    const fd = fs.openSync(asar, 'w');
    try {
      fs.writeSync(fd, prefix);
      fs.writeSync(fd, header);
      fs.writeSync(fd, Buffer.from('code'), 0, 4, dataOffset);
      fs.writeSync(fd, Buffer.from(source), 0, Buffer.byteLength(source), dataOffset + offset);
    } finally {
      fs.closeSync(fd);
    }
    const output = path.join(directory, 'extracted');
    expect(extractRuntime(asar, output)).toBe(output);
    expect(fs.readFileSync(path.join(output, 'package.json'), 'utf8')).toBe(source);
    expect(fs.readFileSync(path.join(output, 'dist-electron', 'Game.js'), 'utf8')).toBe('code');
    expect(fs.existsSync(path.join(output, 'movie.webm'))).toBe(false);
    expect(fs.existsSync(path.join(output, '.complete'))).toBe(true);
    // A completed extraction is reusable, even without opening the archive again.
    fs.unlinkSync(asar);
    expect(extractRuntime(asar, output)).toBe(output);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
