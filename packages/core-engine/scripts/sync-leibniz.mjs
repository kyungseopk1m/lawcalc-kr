#!/usr/bin/env node
// Reads `data/leibniz/v1.json` (workspace single source) and emits
// `src/compensation/datasets/leibniz.dataset.generated.ts`. Run via
// `pnpm sync:leibniz` (also wired into `prebuild` / `pretest`).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");
const SOURCE = resolve(REPO_ROOT, "data/leibniz/v1.json");
const OUT = resolve(PKG_ROOT, "src/compensation/datasets/leibniz.dataset.generated.ts");

const json = JSON.parse(readFileSync(SOURCE, "utf8"));

const banner = [
  "// AUTO-GENERATED. Do not edit by hand.",
  "// Source: data/leibniz/v1.json",
  "// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:leibniz",
  "",
  'import type { LeibnizDataset } from "./leibniz";',
  "",
  "export const DEFAULT_LEIBNIZ_DATASET: LeibnizDataset = ",
].join("\n");

const body = `${JSON.stringify(json, null, 2)};\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + body, "utf8");
process.stdout.write(`✓ wrote ${OUT}\n`);
