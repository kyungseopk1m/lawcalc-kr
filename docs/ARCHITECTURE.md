# Architecture

lawcalc-kr is a local-first desktop application for Korean legal calculations. The current app calculates judgment interest, statutory delay damages, and simplified inheritance shares.

## Principles

- Keep all case data on the user's machine.
- Make calculation steps auditable: inputs, intermediate rows, formulas or shares, totals, and data version must be visible.
- Treat legal/domain data as versioned source data, not hard-coded UI text.
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

1. The desktop UI collects domain-specific inputs and notes.
2. `packages/core-engine` validates input and runs a pure TypeScript domain engine.
3. The engine returns a structured result with calculation trace, totals or shares, disclaimer, and data version.
4. The UI renders the result table and legal references.
5. Tauri commands handle local save/load, CSV/PDF export, and native dialogs.

## Current Integration Surface

- `@lawcalc-kr/core-engine` exposes interest types/functions (`InterestInput`, `InterestResult`, `calculateInterest`) and inheritance types/functions (`InheritanceInput`, `InheritanceResult`, `calculateInheritance`).
- `apps/desktop` is a React 19 + Vite shell with separate interest and inheritance calculator views.
- `apps/desktop/src/lib/ipc.ts` maps UI actions to Tauri commands: interest/inheritance PDF and CSV export, `.lcalc` save/load, and clipboard copy.
- Rust commands are intentionally narrow. They should stay focused on local file IO, native dialogs, PDF/export, and clipboard integration.

## Module Responsibilities

| Module                   | Owns                                                                                                                                            | Must not own                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/core-engine`   | validation, date/day-count rules, rate segmentation, inheritance share distribution, result totals/shares, formula strings, data-version output | browser state, file dialogs, PDF rendering, native clipboard           |
| `apps/desktop/src`       | form state, result presentation, accessibility, user-triggered export actions                                                                   | filesystem writes outside Tauri commands, duplicated calculation rules |
| `apps/desktop/src-tauri` | local file IO, native dialogs, export backends, clipboard integration, packaging metadata                                                       | legal-rate calculation policy, UI-only formatting                      |
| `data/legal-rates`       | versioned legal-rate source data and citations                                                                                                  | runtime user case data                                                 |
| `docs` / CI              | operating contracts, release checklist, lockfile and workflow guardrails                                                                        | feature implementation details owned by A/B/C                          |

The UI may format numbers and dates for display, but calculation-significant rounding and day-count choices must come from the engine result. This keeps PDF/CSV/clipboard output aligned with the on-screen table.

## `.lcalc` File Shape

`.lcalc` files are JSON documents used for reproducible local saves. The schema should include:

- `schemaVersion`, `kind`, and a domain-specific `payload`;
- `payload.appVersion`, `payload.dataVersion`, and `payload.createdAt`;
- `payload.input` and `payload.result` matching the core-engine public types;
- optional `note`;
- the disclaimer text that was shown or exported with the calculation.

The format is local-first and should not require network access. Backward-compatible readers should preserve unknown fields where practical.

Example:

```json
{
  "schemaVersion": "2",
  "kind": "interest",
  "payload": {
    "appVersion": "0.2.3",
    "dataVersion": "legal-rates/v1.0.0",
    "createdAt": "2026-05-10T12:34:56+09:00",
    "input": {
      "principal": 10000000,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "legalRatePreset": "civil",
      "options": {
        "mode": "period",
        "leapYear": "fixed365",
        "includeFirstDay": false,
        "rounding": "floor"
      }
    },
    "options": {
      "mode": "period",
      "leapYear": "fixed365",
      "includeFirstDay": false,
      "rounding": "floor"
    },
    "result": {
      "principal": 10000000,
      "segments": [],
      "totalInterest": 0,
      "grandTotal": 10000000,
      "dataVersion": "legal-rates/v1.0.0"
    },
    "note": "optional user note",
    "disclaimer": "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다."
  }
}
```

Compatibility rules:

- increment `schemaVersion` only when readers need migration logic;
- never infer a missing `dataVersion` for promoted files;
- preserve `note` where practical;
- reject files that do not contain a parseable domain `payload.input`;
- migrate v0.1.x interest-only `schemaVersion: "1"` files into the v2 `kind: "interest"` envelope on load.

## PDF Engine

PDF export uses [`printpdf`](https://crates.io/crates/printpdf) 0.7. We chose it over `typst-as-library` and any HTML-to-PDF route because the report is a single-page tabular form: the typst compiler would inflate the desktop binary by tens of megabytes for layout features we do not need, and a Chromium-based pipeline would add a runtime dependency to a local-first app. `printpdf` is pure Rust, has a stable manual-layout API, and supports embedded TrueType fonts with subsetting. Pretendard Regular (SIL OFL 1.1) ships at `apps/desktop/src-tauri/assets/fonts/Pretendard-Regular.ttf` and is embedded via `include_bytes!` so Korean glyphs render without relying on the host font cache; the OFL text is preserved next to the binary as `Pretendard-OFL.txt`. The exporter writes title, summary block, segment table, optional note, and a footer with disclaimer, `dataVersion`, and `computedAt` — the same fields that appear on screen.

## Non-Goals

- This project is not a clone or port of any court-distributed executable.
- Reverse engineering, decompiling, patching, or resource extraction from official installers is not allowed.
- Official manuals and installers are not redistributed in this repository.
