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

## Temporary Skip During W1

The root `test:golden` script is wired through pnpm workspace packages. Until the core engine and golden fixtures are added, CI may run it as a no-op.
