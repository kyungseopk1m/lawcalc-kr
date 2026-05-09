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

The directories above are owned by different implementation sessions. D owns repository infrastructure, lockfile, CI, release workflow, changelog, README, and top-level docs.

## Data Flow

1. The desktop UI collects principal, date range, rate segments, options, and notes.
2. `packages/core-engine` normalizes input and splits periods by rate intervals.
3. The engine returns a structured result with segment formulas and totals.
4. The UI renders the result table and legal citations.
5. Tauri commands handle local save/load, CSV/PDF export, and native dialogs.

## Current Integration Surface

- `@lawcalc-kr/core-engine` exposes the public `InterestInput`, `InterestResult`, `CalcOptions`, `RateSegment`, and `LegalRatePreset` types.
- `apps/desktop` is a React 19 + Vite shell that binds principal, date range, legal-rate preset, options, and rate segments to `InterestInput`.
- `apps/desktop/src/lib/ipc.ts` maps UI actions to Tauri commands: `export_pdf`, `export_csv`, `save_lcalc`, `load_lcalc`, and `copy_to_clipboard`.
- Rust commands are intentionally narrow. They should stay focused on local file IO, native dialogs, PDF/export, and clipboard integration.

## Module Responsibilities

| Module                   | Owns                                                                                                       | Must not own                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/core-engine`   | validation, date/day-count rules, rate segmentation, interest totals, formula strings, data-version output | browser state, file dialogs, PDF rendering, native clipboard           |
| `apps/desktop/src`       | form state, result presentation, accessibility, user-triggered export actions                              | filesystem writes outside Tauri commands, duplicated calculation rules |
| `apps/desktop/src-tauri` | local file IO, native dialogs, export backends, clipboard integration, packaging metadata                  | legal-rate calculation policy, UI-only formatting                      |
| `data/legal-rates`       | versioned legal-rate source data and citations                                                             | runtime user case data                                                 |
| `docs` / CI              | operating contracts, release checklist, lockfile and workflow guardrails                                   | feature implementation details owned by A/B/C                          |

The UI may format numbers and dates for display, but calculation-significant rounding and day-count choices must come from the engine result. This keeps PDF/CSV/clipboard output aligned with the on-screen table.

## `.lcalc` File Shape

`.lcalc` files are JSON documents used for reproducible local saves. The schema should include:

- `schemaVersion`, `appVersion`, `dataVersion`, and `createdAt`;
- `input` and `options` matching the core-engine public types;
- `result` matching `InterestResult`;
- optional `note`;
- the disclaimer text that was shown or exported with the calculation.

The format is local-first and should not require network access. Backward-compatible readers should preserve unknown fields where practical.

Example:

```json
{
  "schemaVersion": "1",
  "appVersion": "0.0.0",
  "dataVersion": "legal-rates/v1.0.0",
  "createdAt": "2026-05-09T12:34:56+09:00",
  "input": {
    "principal": 10000000,
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "legalRatePreset": "civil",
    "options": {
      "mode": "period",
      "leapYear": "fixed365",
      "includeFirstDay": false
    }
  },
  "options": {
    "mode": "period",
    "leapYear": "fixed365",
    "includeFirstDay": false
  },
  "result": {
    "principal": 10000000,
    "segments": [],
    "totalInterest": 0,
    "grandTotal": 10000000,
    "dataVersion": "legal-rates/v1.0.0"
  },
  "note": "optional user note",
  "disclaimer": "This calculation is for review only."
}
```

Compatibility rules:

- increment `schemaVersion` only when readers need migration logic;
- never infer a missing `dataVersion` for promoted files;
- preserve `note` and unknown top-level fields on load/save when possible;
- reject files that do not contain a parseable `input` object.

## PDF Engine

PDF export uses [`printpdf`](https://crates.io/crates/printpdf) 0.7. We chose it over `typst-as-library` and any HTML-to-PDF route because the report is a single-page tabular form: the typst compiler would inflate the desktop binary by tens of megabytes for layout features we do not need, and a Chromium-based pipeline would add a runtime dependency to a local-first app. `printpdf` is pure Rust, has a stable manual-layout API, and supports embedded TrueType fonts with subsetting. Pretendard Regular (SIL OFL 1.1) ships at `apps/desktop/src-tauri/assets/fonts/Pretendard-Regular.ttf` and is embedded via `include_bytes!` so Korean glyphs render without relying on the host font cache; the OFL text is preserved next to the binary as `Pretendard-OFL.txt`. The exporter writes title, summary block, segment table, optional note, and a footer with disclaimer, `dataVersion`, and `computedAt` — the same fields that appear on screen.

## Non-Goals

- This project is not a clone or port of any court-distributed executable.
- Reverse engineering, decompiling, patching, or resource extraction from official installers is not allowed.
- Official manuals and installers are not redistributed in this repository.
