# Development Workflow

lawcalc-kr is being built by multiple focused sessions. Keep each session's work isolated so one session cannot rewrite or stash another session's changes.

## Session Ownership

- A owns `packages/core-engine/**`, `data/**`, and `docs/INTEREST_FORMULAS.md`.
- B owns `apps/desktop/src/**`.
- C owns `apps/desktop/src-tauri/**` and desktop IPC/output wiring.
- D owns infrastructure, repository docs, CI, release workflow, lockfile validation, and release notes.

Do not edit another session's files unless that session explicitly hands off the work.

## Required Isolation Rules

1. Commit and push working tree changes as soon as they form a coherent unit.
2. Do not run `git pull --rebase` while `git status --short` shows modified, staged, untracked, or conflicted files.
3. Do not use `git pull --rebase --autostash` in the shared checkout.
4. Prefer a dedicated worktree for each active session:

   ```bash
   git fetch origin
   git worktree add ../lawcalc-kr-d origin/main
   ```

5. If one shared checkout must be used, stage only owned files and confirm the exact staged set before committing:

   ```bash
   git status --short
   git diff --cached --name-only
   ```

6. Preserve unknown stashes until the owning session confirms they are obsolete.

## Sync Checklist

Before pulling or rebasing:

1. Run `git status --short --branch`.
2. If the tree is dirty, either commit and push owned work or move to a dedicated worktree.
3. If untracked files belong to another session, do not delete, stage, or stash them.
4. After the tree is clean, run:

   ```bash
   git pull --rebase origin main
   ```

5. Run the checks relevant to the changed area, then push immediately.

## Stash Policy

Stashes are not a normal collaboration mechanism for this repository. Treat a stash as shared state until proven otherwise.

- Inspect with `git stash show --name-only stash@{N}` and `git stash show --stat stash@{N}`.
- Compare against `HEAD` before deciding whether the content is already preserved.
- Drop a stash only when every file is either already committed or explicitly abandoned by its owner.
- If a stash includes another session's files, keep it and record the decision in `docs/history/in-progress.md`.

## CI Monitoring

D monitors `main` after each pushed integration commit:

```bash
gh run list --branch main --limit 5
gh run view <run-id> --log-failed
```

If CI is red in another session's area, record the failing run and owner. Keep D fixes scoped to infrastructure, docs, release workflow, and lockfile issues unless ownership is handed off.
