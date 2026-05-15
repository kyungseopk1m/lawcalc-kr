#!/usr/bin/env node
// Reads `data/hoffman/v1.json` (workspace single source) and emits
// `src/compensation/datasets/hoffman.dataset.generated.ts`. Run via
// `pnpm sync:hoffman` (also wired into `prebuild` / `pretest`).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");
const SOURCE = resolve(REPO_ROOT, "data/hoffman/v1.json");
const OUT = resolve(PKG_ROOT, "src/compensation/datasets/hoffman.dataset.generated.ts");

const json = JSON.parse(readFileSync(SOURCE, "utf8"));

const banner = [
  "// AUTO-GENERATED. Do not edit by hand.",
  "// Source: data/hoffman/v1.json",
  "// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:hoffman",
  "",
  'import type { HoffmanDataset } from "./hoffman";',
  "",
  "export const DEFAULT_HOFFMAN_DATASET: HoffmanDataset = ",
].join("\n");

const body = `${JSON.stringify(json, null, 2)};\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + body, "utf8");
process.stdout.write(`✓ wrote ${OUT}\n`);
