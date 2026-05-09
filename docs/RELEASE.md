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

1. Confirm the working tree is clean. Do not rebase with modified, staged, untracked, or conflicted files.

   ```bash
   git status --short --branch
   ```

2. Confirm there are no active stashes and no untracked files.

   ```bash
   git stash list
   git status --short
   ```

3. Confirm the staged set is empty before starting release edits, then includes only D-owned files before the release-prep commit.

   ```bash
   git diff --cached --name-only
   ```

4. Pull and rebase on `main`.

   ```bash
   git pull --rebase origin main
   ```

5. Verify lockfile determinism.

   ```bash
   pnpm install --frozen-lockfile
   ```

6. Run the CI-equivalent checks locally.

   ```bash
   pnpm lint
   pnpm test
   pnpm test:golden
   pnpm build
   ```

7. Confirm the changelog has a `0.1.0 - YYYY-MM-DD` section with Korean-first user notes for:
   - core engine changes;
   - desktop form and result UI changes;
   - `.lcalc`, CSV, PDF, or clipboard changes;
   - legal-rate data changes;
   - breaking schema or calculation-policy changes.

8. Confirm README screenshots or demo GIFs are real assets for the release. Do not ship placeholder demo media.

9. Confirm no active multi-session stash contains release, Tauri, or app changes that should ship.

10. Confirm incomplete v0.2+ features are disabled in the UI and called out as future work, not presented as usable v0.1.0 features.

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

For v0.1.0, the draft release body must include Korean user notes, download guidance, the legal disclaimer, and `.lcalc` schemaVersion `1` compatibility.

## Artifact Review

For each draft release, check:

- macOS artifact exists and is built from the universal Apple target;
- Windows artifact exists;
- app name, window title, and package metadata use lawcalc-kr/LawCalc Korea consistently;
- no test fixture, draft JSON, or `_wip` golden file is included;
- legal disclaimer is visible in the app and exported report path;
- release notes mention that calculations are review aids, not legal advice.

## Final Stop Sign

Do not create `v0.1.0` until all of the following are true:

- `main` CI is green after the final release-prep commit;
- macOS and Windows dry-run artifacts exist in a draft release;
- `pnpm audit` reports zero known vulnerabilities or the accepted risk is documented;
- license metadata is consistent across root and package manifests;
- `.lcalc` schemaVersion `1` load/save has been tested;
- README and CHANGELOG describe the same feature set;
- D has recorded any deferred v0.2 work in `docs/USER_TEST_PLAN.md` or `CHANGELOG.md`.

## Failure Handling

- If `pnpm install --frozen-lockfile` fails after another session changes dependencies, run `pnpm install`, commit only `pnpm-lock.yaml`, and push after `git pull --rebase origin main`.
- If CI fails, inspect the failing run before editing:

  ```bash
  gh run view <run-id> --log-failed
  ```

- Keep release fixes scoped to D-owned files unless the failure is clearly in another session's area and that session has handed it off.
