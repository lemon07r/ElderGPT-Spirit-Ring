const fs = require('fs');
const yauzl = require('yauzl');

function readZipFiles(zipPath, requestedNames) {
  if (!fs.existsSync(zipPath)) {
    return Promise.reject(new Error(`Release ZIP not found: ${zipPath}`));
  }

  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(openError ?? new Error(`Unable to open ${zipPath}`));
        return;
      }

      const entries = [];
      const files = new Map();
      let settled = false;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        callback();
      };

      zipfile.once('error', (error) => finish(() => reject(error)));
      zipfile.once('end', () =>
        finish(() => resolve({ entries, files })),
      );
      zipfile.on('entry', (entry) => {
        entries.push(entry.fileName);
        if (
          entry.fileName.endsWith('/') ||
          !requestedNames.some((name) => entry.fileName.endsWith(name))
        ) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            finish(() =>
              reject(
                streamError ??
                  new Error(`Unable to read ${entry.fileName} from ${zipPath}`),
              ),
            );
            return;
          }

          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('error', (error) => finish(() => reject(error)));
          stream.once('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
            zipfile.readEntry();
          });
        });
      });
      zipfile.readEntry();
    });
  });
}

module.exports = { readZipFiles };
