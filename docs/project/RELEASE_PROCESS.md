---
title: Release Process
status: active
authoritative: true
owner: eldergpt-maintainers
last_verified: 2026-04-06
source_of_truth: package.json,scripts/workshop-upload.ts,.github/workflows/release.yml,../ModUploader-AFNM/electron/main/cli.ts
review_cycle_days: 30
related_files: package.json,scripts/workshop-upload.ts,docs/project/LIVE_GAME_TESTING.md,.github/workflows/release.yml,AGENTS.md
---

# Release Process

Use this sequence when preparing a real release.

## 1. Validate Code And Docs

Run:

```bash
bun run release:validate
```

If the runtime oracle no longer reports the expected AFNM capabilities, stop and refresh the integration/docs before releasing.

## 2. Run A Manual Game Smoke Test

Follow [LIVE_GAME_TESTING.md](./LIVE_GAME_TESTING.md).

Minimum manual checks:

- the mod zip loads from the installed `mods/` directory
- the floating toggle still opens the chat
- the `combat-victory` injected button opens the chat
- minimizing and reopening the chat keeps the conversation history
- proactive suggestions can appear without breaking the unread badge/state flow
- chat requests still round-trip to a configured endpoint

## 3. Bump Version

Update the version in `package.json`.

This repo treats `package.json` as the single release version source of truth. The build step writes that same version into the packaged `dist/.../package.json`.

## 4. Build The Release Artifact

```bash
bun run build
```

The packaged artifact is written to `builds/afnm-eldergpt-spirit-ring.zip`.

If the Workshop thumbnail should change, regenerate it before uploading:

```bash
bun run workshop:preview
```

Source artwork lives at `docs/assets/workshop-preview.svg` and the uploader uses `docs/assets/workshop-preview.png` by default when that file exists.

The Workshop title and user-facing description should still be maintained in repo as reference copy:

- title default: `ElderGPT Spirit Ring`
- description source: `docs/assets/workshop-description.bbcode`

Keep the Workshop description player-facing. It should explain value, features, setup, and usage clearly without leaking internal dev workflow or maintenance notes.

Important:

- normal update uploads should preserve the live Workshop title/description by default
- only pass `--title`, `--description`, or `--sync-workshop-page` when you intentionally want to overwrite the live Workshop page copy

## 5. Upload To Workshop

```bash
bun run workshop:upload -- --change-note "vX.Y.Z - release notes"
```

The wrapper uploads with `--visibility public` by default unless explicitly overridden.
It also preserves the current live Workshop title/description unless you explicitly override them.

First publish flow when no workshop item exists yet:

```bash
bun run workshop:upload -- --allow-create --title "ElderGPT Spirit Ring" --change-note "vX.Y.Z - initial public release"
```

If you intentionally want to sync the committed repo title/description back to the Workshop page on an existing item:

```bash
bun run workshop:upload -- --sync-workshop-page --change-note "vX.Y.Z - refresh Workshop page copy"
```

After first publish, write the returned workshop item ID back into `scripts/workshop-upload.ts` so normal update releases can use the default wrapper path.

Equivalent explicit uploader command:

```bash
cd ../ModUploader-AFNM
bun run cli:prepare
bun run cli:upload -- --workshop-id 3661729323 --zip /absolute/path/to/builds/afnm-eldergpt-spirit-ring.zip --change-note "vX.Y.Z - release notes" --visibility public
```

This requires the sibling `../ModUploader-AFNM` repo and a working local Steam environment for the actual upload step.

## 6. Commit, Tag, And Publish

Use conventional commits:

- `feat:`
- `fix:`
- `docs:`
- `chore(release):`

If you are working from a real git checkout:

```bash
git add package.json package-lock.json src docs scripts .github AGENTS.md
git commit -m "chore(release): vX.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag push triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml), which builds the mod and publishes `builds/afnm-eldergpt-spirit-ring.zip` as a GitHub Release asset.

If you are working from a non-git export, complete the version/build/docs/workshop steps locally and then repeat the commit/push/tag portion from the actual repository clone.
