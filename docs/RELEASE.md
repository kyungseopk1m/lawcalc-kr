# Release

lawcalc-kr releases are GitHub draft releases built by `tauri-apps/tauri-action` from version tags. D owns the workflow and release checklist; feature sessions should not edit release automation without coordination.

## Release Inputs

- Version tag: `vMAJOR.MINOR.PATCH`
- Branch: `main`
- Platforms:
  - `macos-latest` with `--target universal-apple-darwin`
  - `windows-latest`
- Package manager: `pnpm install --frozen-lockfile`
- Release mode: GitHub draft release

## Pre-Tag Checklist

1. Pull and rebase on `main`.

   ```bash
   git pull --rebase origin main
   ```

2. Verify lockfile determinism.

   ```bash
   pnpm install --frozen-lockfile
   ```

3. Run the CI-equivalent checks locally.

   ```bash
   pnpm lint
   pnpm test
   pnpm test:golden
   pnpm build
   ```

4. Confirm the changelog has a useful `Unreleased` summary for:
   - core engine changes;
   - desktop form and result UI changes;
   - `.lcalc`, CSV, PDF, or clipboard changes;
   - legal-rate data changes;
   - breaking schema or calculation-policy changes.

5. Confirm README screenshots or demo GIF placeholders are either real assets or clearly marked placeholders.

## W4 Dry Run

Before the first user-facing release, create a temporary pre-release tag and confirm both platforms produce draft artifacts.

```bash
git tag v0.0.0-dryrun.1
git push origin v0.0.0-dryrun.1
gh run list --limit 5
gh run watch <run-id> --exit-status
```

After the dry run, delete the temporary tag and draft release if the artifacts are not meant to remain public.

```bash
git tag -d v0.0.0-dryrun.1
git push origin :refs/tags/v0.0.0-dryrun.1
```

## Artifact Review

For each draft release, check:

- macOS artifact exists and is built from the universal Apple target;
- Windows artifact exists;
- app name, window title, and package metadata use lawcalc-kr/LawCalc Korea consistently;
- no test fixture, draft JSON, or `_wip` golden file is included;
- legal disclaimer is visible in the app and exported report path;
- release notes mention that calculations are review aids, not legal advice.

## Failure Handling

- If `pnpm install --frozen-lockfile` fails after another session changes dependencies, run `pnpm install`, commit only `pnpm-lock.yaml`, and push after `git pull --rebase origin main`.
- If CI fails, inspect the failing run before editing:

  ```bash
  gh run view <run-id> --log-failed
  ```

- Keep release fixes scoped to D-owned files unless the failure is clearly in another session's area and that session has handed it off.
