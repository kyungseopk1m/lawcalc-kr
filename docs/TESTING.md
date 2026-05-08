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

## Golden Fixtures

Golden fixtures belong under the core-engine test area. Work-in-progress cases that are not ready for CI should stay in an ignored `_wip` directory and must not be treated as authoritative expected output.

When a golden case is promoted into CI, record the data source, calculation options, expected segment days, expected interest, and the legal-rate data version together.
