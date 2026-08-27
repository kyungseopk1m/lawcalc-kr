#!/usr/bin/env node
// Reads `data/case-value/v1.json` (workspace single source) and emits
// `src/litigation-cost/case-value-dataset.generated.ts`. Run via `pnpm sync:case-value`
// (also wired into `prebuild` / `pretest`).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");
const SOURCE = resolve(REPO_ROOT, "data/case-value/v1.json");
const OUT = resolve(PKG_ROOT, "src/litigation-cost/case-value-dataset.generated.ts");

const json = JSON.parse(readFileSync(SOURCE, "utf8"));

const banner = [
  "// AUTO-GENERATED. Do not edit by hand.",
  "// Source: data/case-value/v1.json",
  "// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:case-value",
  "",
  'import type { CaseValueDataset } from "./case-value-dataset";',
  "",
  "export const DEFAULT_CASE_VALUE_DATASET: CaseValueDataset = ",
].join("\n");

const body = `${JSON.stringify(json, null, 2)};\n`;

writeFileSync(OUT, banner + body, "utf8");
process.stdout.write(`✓ wrote ${OUT}\n`);
