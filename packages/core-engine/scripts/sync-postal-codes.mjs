#!/usr/bin/env node
// Reads `data/postal-codes/v1.json` (workspace single source) and emits
// `src/postal/dataset.generated.ts`. Run via `pnpm sync:postal-codes`
// (also wired into `prebuild` / `pretest`).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");
const SOURCE = resolve(REPO_ROOT, "data/postal-codes/v1.json");
const OUT = resolve(PKG_ROOT, "src/postal/dataset.generated.ts");

const json = JSON.parse(readFileSync(SOURCE, "utf8"));

const banner = [
  "// AUTO-GENERATED. Do not edit by hand.",
  "// Source: data/postal-codes/v1.json",
  "// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:postal-codes",
  "",
  'import type { PostalCodeDataset } from "./types";',
  "",
  "export const DEFAULT_POSTAL_CODE_DATASET: PostalCodeDataset = ",
].join("\n");

writeFileSync(OUT, `${banner}${JSON.stringify(json, null, 2)};\n`, "utf8");
process.stdout.write(`✓ wrote ${OUT}\n`);
