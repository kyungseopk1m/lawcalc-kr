# Architecture

lawcalc-kr is a local-first desktop application for Korean legal calculations. The MVP calculates judgment interest and statutory delay damages.

## Principles

- Keep all case data on the user's machine.
- Make calculation steps auditable: inputs, segmented periods, rates, formulas, totals, and data version must be visible.
- Treat legal-rate data as versioned source data, not hard-coded UI text.
- Keep the calculation engine pure TypeScript so it can be tested independently from Tauri.
- Keep Tauri commands narrow: file IO, PDF/export, native dialogs, and desktop packaging.

## Workspace Layout

```text
lawcalc-kr/
├── apps/
│   └── desktop/          # React + Vite + Tauri desktop app
├── packages/
│   └── core-engine/      # Pure TypeScript calculation engine
├── data/
│   └── legal-rates/      # Versioned legal-rate datasets
├── tests/
│   └── golden/           # Court-program comparison cases
└── docs/
```

The directories above are owned by different implementation sessions. This W1 setup intentionally creates only D-session infrastructure and documentation files.

## Data Flow

1. The desktop UI collects principal, date range, rate segments, options, and notes.
2. `packages/core-engine` normalizes input and splits periods by rate intervals.
3. The engine returns a structured result with segment formulas and totals.
4. The UI renders the result table and legal citations.
5. Tauri commands handle local save/load, CSV/PDF export, and native dialogs.

## Non-Goals

- This project is not a clone or port of any court-distributed executable.
- Reverse engineering, decompiling, patching, or resource extraction from official installers is not allowed.
- Official manuals and installers are not redistributed in this repository.
