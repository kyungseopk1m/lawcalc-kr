#!/usr/bin/env node
// Reads `data/court-filings-civil/v1.json` and `data/court-filings-criminal/v1.json`
// (workspace single sources) and emits `src/filings/*.dataset.generated.ts`.
// Run via `pnpm sync:court-filings` (also wired into `prebuild` / `pretest`).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");

for (const [id, type, name] of [
  ["court-filings-civil", "CivilFilingDataset", "DEFAULT_CIVIL_FILING_DATASET"],
  ["court-filings-criminal", "CriminalFilingDataset", "DEFAULT_CRIMINAL_FILING_DATASET"],
]) {
  const json = JSON.parse(readFileSync(resolve(REPO_ROOT, `data/${id}/v1.json`), "utf8"));
  const out = resolve(
    PKG_ROOT,
    `src/filings/${id.replace("court-filings-", "")}.dataset.generated.ts`,
  );
  const banner = [
    "// AUTO-GENERATED. Do not edit by hand.",
    `// Source: data/${id}/v1.json`,
    "// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:court-filings",
    "",
    `import type { ${type} } from "./types";`,
    "",
    `export const ${name}: ${type} = `,
  ].join("\n");
  writeFileSync(out, `${banner}${JSON.stringify(json, null, 2)};\n`, "utf8");
  process.stdout.write(`✓ wrote ${out}\n`);
}
