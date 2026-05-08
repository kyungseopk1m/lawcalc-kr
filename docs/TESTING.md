# Testing

lawcalc-kr uses layered tests so the legal calculation engine can be trusted separately from the desktop shell.

## Test Layers

- Unit tests: date normalization, day counts, segment splitting, rounding, and formula output.
- Fixture tests: known manual examples and edge cases expressed as structured JSON.
- Golden tests: black-box comparison cases against official calculator outputs where permitted.
- Desktop smoke tests: Tauri command wiring, save/load, and export flows.

## Golden Test Policy

Golden tests compare inputs and independently recorded outputs. They must not depend on reverse-engineered code, copied official assets, or redistributed official installers/manuals.

Each golden case should include:

- principal;
- start and end dates;
- rate segments or preset;
- first-day and leap-year options;
- expected segment days and interest;
- source note explaining how the expected output was obtained;
- data version.

## W2 Integration Checks

- `pnpm install --frozen-lockfile` must pass after every A/B/C integration push.
- `pnpm lint`, `pnpm test`, and `pnpm test:golden` are the baseline CI checks.
- `pnpm build` should be run before release-prep changes or when TypeScript package surfaces change.
- Golden fixtures may remain placeholders until official black-box comparison outputs are recorded.

Recommended local sequence for D after another session pushes:

```bash
git pull --rebase origin main
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm test:golden
```

Run `pnpm build` when dependency surfaces, TypeScript references, Tauri config, release workflow, or package boundaries change.

## CI Monitoring

Use GitHub Actions as the source of truth after each push to `main`.

```bash
gh run list --limit 5
gh run watch <run-id> --exit-status
```

If a run fails:

- inspect failed logs before changing code: `gh run view <run-id> --log-failed`;
- classify the failure as lockfile, lint/type, unit/golden test, or workflow/runtime;
- keep D fixes limited to lockfile, CI, docs, changelog, README, and release workflow unless ownership is explicitly handed off;
- when a dependency change causes `ERR_PNPM_OUTDATED_LOCKFILE`, run `pnpm install`, stage only `pnpm-lock.yaml`, and commit it as a lockfile refresh.

## Golden Fixtures

Golden fixtures belong under the core-engine test area. Work-in-progress cases that are not ready for CI should stay in an ignored `_wip` directory and must not be treated as authoritative expected output.

When a golden case is promoted into CI, record the data source, calculation options, expected segment days, expected interest, and the legal-rate data version together.

## `.lcalc` Compatibility Tests

Once C wires save/load beyond stubs, add tests that cover:

- valid current-schema file loads without mutation;
- unknown fields survive load/save where practical;
- missing `schemaVersion`, `dataVersion`, or `input` fails with a user-facing error;
- result `dataVersion` matches the file-level `dataVersion`;
- draft fixtures under `_wip` are ignored by CI.
