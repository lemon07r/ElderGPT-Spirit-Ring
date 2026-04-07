import * as fs from 'fs';
import * as path from 'path';

type CliArgs = {
  changeNote?: string;
  workshopId?: string;
  title?: string;
  description?: string;
  tags?: string;
  previewImagePath?: string;
  allowCreate: boolean;
  zipPath: string;
  visibility: WorkshopVisibility;
  skipBuild: boolean;
  skipUploaderPrepare: boolean;
  openWorkshopPage: boolean;
  json: boolean;
  help: boolean;
};

const DEFAULT_WORKSHOP_ID = '3701616500';
const DEFAULT_WORKSHOP_TITLE = 'ElderGPT Spirit Ring';
const VALID_VISIBILITY = ['public', 'friends', 'private', 'unlisted'] as const;
type WorkshopVisibility = (typeof VALID_VISIBILITY)[number];

function printUsage(): void {
  console.log(`ElderGPT Spirit Ring workshop upload

Usage:
  bun run workshop:upload -- --change-note "What changed"

Options:
  --change-note <text>        Change notes for the workshop update
  --workshop-id <id>          Override the default ElderGPT Spirit Ring workshop item ID
  --title <text>              Optional workshop title override (default: ElderGPT Spirit Ring)
  --description <text>        Optional workshop description override
  --tags <csv>                Optional comma-separated workshop tags
  --preview <path>            Optional preview image path (defaults to docs/assets/workshop-preview.png when present)
  --allow-create              Create a new workshop item when no workshop ID exists
  --zip <path>                Override the default build zip path
  --visibility <value>        public | friends | private | unlisted (default: public)
  --skip-build                Skip rebuilding ElderGPT Spirit Ring before upload
  --skip-uploader-prepare     Skip rebuilding ModUploader-AFNM before upload
  --open-workshop-page        Open the workshop page in Steam overlay after upload
  --json                      Ask the uploader for machine-readable output
  --help                      Show this help
`);
}

function consumeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readTextFileIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const content = fs.readFileSync(filePath, 'utf8').trim();
  return content || undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const repoRoot = path.resolve(import.meta.dir, '..');
  const defaultDescriptionPath = path.resolve(
    repoRoot,
    'docs',
    'assets',
    'workshop-description.bbcode',
  );
  const defaultPreviewImagePath = path.resolve(
    repoRoot,
    'docs',
    'assets',
    'workshop-preview.png',
  );
  const parsed: CliArgs = {
    workshopId: DEFAULT_WORKSHOP_ID || undefined,
    title: DEFAULT_WORKSHOP_TITLE,
    description: readTextFileIfExists(defaultDescriptionPath),
    allowCreate: false,
    zipPath: path.resolve(repoRoot, 'builds', 'afnm-eldergpt-spirit-ring.zip'),
    previewImagePath: fs.existsSync(defaultPreviewImagePath)
      ? defaultPreviewImagePath
      : undefined,
    visibility: 'public',
    skipBuild: false,
    skipUploaderPrepare: false,
    openWorkshopPage: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--help':
        parsed.help = true;
        break;
      case '--skip-build':
        parsed.skipBuild = true;
        break;
      case '--skip-uploader-prepare':
        parsed.skipUploaderPrepare = true;
        break;
      case '--open-workshop-page':
        parsed.openWorkshopPage = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--change-note':
        parsed.changeNote = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--title':
        parsed.title = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--description':
        parsed.description = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--tags':
        parsed.tags = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--workshop-id':
        parsed.workshopId = consumeValue(argv, index, arg);
        index += 1;
        break;
      case '--preview':
        parsed.previewImagePath = path.resolve(consumeValue(argv, index, arg));
        index += 1;
        break;
      case '--allow-create':
        parsed.allowCreate = true;
        break;
      case '--zip':
        parsed.zipPath = path.resolve(consumeValue(argv, index, arg));
        index += 1;
        break;
      case '--visibility': {
        const visibility = consumeValue(argv, index, arg) as WorkshopVisibility;
        if (!VALID_VISIBILITY.includes(visibility)) {
          throw new Error(
            `Invalid visibility "${visibility}". Expected one of: ${VALID_VISIBILITY.join(', ')}`,
          );
        }
        parsed.visibility = visibility;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function runCommand(
  label: string,
  cmd: string[],
  cwd: string,
  captureOutput = false,
): { stdoutText?: string } {
  console.log(`\n== ${label} ==`);
  console.log(`$ ${cmd.join(' ')}`);

  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: captureOutput ? 'pipe' : 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode}`);
  }

  return {
    stdoutText:
      captureOutput && result.stdout
        ? Buffer.from(result.stdout).toString('utf8').trim()
        : undefined,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.changeNote) {
    throw new Error('Missing required --change-note argument');
  }

  if (!args.workshopId && !args.allowCreate) {
    throw new Error(
      'Missing workshop item ID. Pass --workshop-id for updates or --allow-create for a first publish.',
    );
  }

  const repoRoot = path.resolve(import.meta.dir, '..');
  const uploaderRoot = path.resolve(repoRoot, '..', 'ModUploader-AFNM');

  if (!fs.existsSync(uploaderRoot)) {
    throw new Error(`ModUploader-AFNM not found at ${uploaderRoot}`);
  }

  if (!args.skipBuild) {
    runCommand('Build ElderGPT Spirit Ring', [process.execPath, 'run', 'build'], repoRoot);
  }

  if (!fs.existsSync(args.zipPath)) {
    throw new Error(`Build zip not found at ${args.zipPath}`);
  }

  if (!args.skipUploaderPrepare) {
    runCommand(
      'Prepare ModUploader-AFNM',
      [process.execPath, 'run', 'cli:prepare'],
      uploaderRoot,
    );
  }

  const uploadArgs = [
    process.execPath,
    'run',
    'cli:upload',
    '--',
    '--zip',
    args.zipPath,
    '--change-note',
    args.changeNote,
    '--visibility',
    args.visibility,
  ];

  if (args.workshopId) {
    uploadArgs.push('--workshop-id', args.workshopId);
  }

  if (args.allowCreate) {
    uploadArgs.push('--allow-create');
  }

  if (args.title) {
    uploadArgs.push('--title', args.title);
  }

  if (args.description) {
    uploadArgs.push('--description', args.description);
  }

  if (args.tags) {
    uploadArgs.push('--tags', args.tags);
  }

  if (args.previewImagePath) {
    uploadArgs.push('--preview', args.previewImagePath);
  }

  if (args.openWorkshopPage) {
    uploadArgs.push('--open-workshop-page');
  }

  if (args.json) {
    uploadArgs.push('--json');
  }

  const uploadResult = runCommand(
    'Upload to Steam Workshop',
    uploadArgs,
    uploaderRoot,
    args.json,
  );

  if (args.json && uploadResult.stdoutText) {
    console.log(uploadResult.stdoutText);
    return;
  }

  console.log('\nWorkshop upload completed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Workshop upload wrapper failed: ${message}`);
  printUsage();
  process.exit(1);
});
