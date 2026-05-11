#!/usr/bin/env node
// Fail the CI build if any React/TypeScript file under `apps/desktop/src`
// contains a hardcoded version literal that should instead come from the
// `__APP_VERSION__` define wired up by `vite.config.ts`. This catches the
// "InfoDialog left at v0.2.5" class of bugs where a single hardcoded version
// silently drifts across multiple releases.
//
// The check is intentionally narrow:
//   - It only inspects `apps/desktop/src/**/*.{ts,tsx}` files.
//   - It skips test files (`*.test.ts`, `*.test.tsx`) and `__snapshots__`
//     directories, where fixture version literals are expected and intentional.
//   - It only flags two surface shapes:
//       1. `"v0.3.1"` / `"0.3.1"` quoted string literals.
//       2. `>v0.3.1<` JSX text nodes.
//     Comments and TypeScript reference comments that happen to mention a
//     version slip through, which is acceptable since the goal is preventing
//     runtime drift, not enforcing prose hygiene.
//
// Usage:
//   node scripts/check-hardcoded-version.mjs
//   pnpm check:hardcoded-version
//
// Exits 0 on clean tree, 1 on offenders.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TARGET_DIR = path.join(ROOT, "apps/desktop/src");

const SKIP_FILE_PATTERNS = [/\.test\.tsx?$/, /\.spec\.tsx?$/];
const SKIP_DIR_NAMES = new Set(["__snapshots__", "node_modules", "dist"]);

// Matches `"v0.3.1"` / `"0.3.1"` (with optional prerelease tag) and JSX text
// nodes wrapped in tags such as `<span>v0.3.1</span>`.
const HARDCODED_VERSION =
  /("v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?"|>v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?<)/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (stat.isFile() && /\.tsx?$/.test(full)) {
      if (SKIP_FILE_PATTERNS.some((re) => re.test(full))) continue;
      yield full;
    }
  }
}

const offenders = [];

for (const file of walk(TARGET_DIR)) {
  const text = readFileSync(file, "utf-8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = HARDCODED_VERSION.exec(line);
    if (match) {
      offenders.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        snippet: line.trim(),
        match: match[0],
      });
    }
  }
}

if (offenders.length === 0) {
  console.log(
    "check:hardcoded-version: no hardcoded version literals found under apps/desktop/src.",
  );
  process.exit(0);
}

console.error("check:hardcoded-version: hardcoded version literals detected.");
console.error("Use the `__APP_VERSION__` define (wired in vite.config.ts) instead.");
console.error();
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}  ${o.match}`);
  console.error(`    ${o.snippet}`);
}
process.exit(1);
