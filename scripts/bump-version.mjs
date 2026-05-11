#!/usr/bin/env node
// Bump lawcalc-kr desktop app version across all known surfaces and stage a
// CHANGELOG release section. Single source of truth is
// `apps/desktop/package.json#version`; this script keeps the Tauri config and
// Rust crate manifest in sync, and the React `__APP_VERSION__` define picks the
// value from that package.json at build time.
//
// Usage:
//   node scripts/bump-version.mjs 0.3.2
//
// The script performs the following edits relative to the repository root:
//   1. `apps/desktop/package.json` -> version field
//   2. `apps/desktop/src-tauri/tauri.conf.json` -> version field
//   3. `apps/desktop/src-tauri/Cargo.toml` -> top-level [package].version
//   4. `apps/desktop/CHANGELOG.md`:
//      - Insert a `## [<new>] - <today>` section right under `## [Unreleased]`
//        with the current Unreleased body, leaving a fresh empty Unreleased.
//      - Update the compare links at the bottom of the file so the new tag
//        points to the previous tag and the Unreleased link points to the new
//        tag.
//
// The script refuses to run if the working tree is dirty for any file it would
// write, to avoid clobbering in-progress edits. Run after `pnpm test` and
// before committing.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const SEMVER = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;

function fail(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

function todayIso() {
  // Stamp the release date in the project's primary release timezone (KST)
  // so a developer running the bump just past midnight UTC doesn't see the
  // CHANGELOG land on the previous calendar day relative to the prior entry.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const target = process.argv[2];
if (!target) {
  fail("missing target version. usage: node scripts/bump-version.mjs <X.Y.Z>");
}
if (!SEMVER.test(target)) {
  fail(`target version '${target}' is not a valid semver (X.Y.Z[-prerelease])`);
}

const FILES = {
  desktopPkg: path.join(ROOT, "apps/desktop/package.json"),
  tauriConf: path.join(ROOT, "apps/desktop/src-tauri/tauri.conf.json"),
  cargoToml: path.join(ROOT, "apps/desktop/src-tauri/Cargo.toml"),
  changelog: path.join(ROOT, "CHANGELOG.md"),
};

function ensureClean(file) {
  try {
    const status = execSync(`git status --porcelain -- ${JSON.stringify(file)}`, {
      cwd: ROOT,
      encoding: "utf-8",
    }).trim();
    if (status.length > 0) {
      fail(`refuse to overwrite: ${file} has uncommitted changes (${status}).`);
    }
  } catch (err) {
    fail(`failed to inspect git status for ${file}: ${err.message}`);
  }
}

Object.values(FILES).forEach(ensureClean);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const desktopPkg = readJson(FILES.desktopPkg);
const previous = desktopPkg.version;
if (previous === target) {
  fail(`target version '${target}' matches the current desktop package version.`);
}

desktopPkg.version = target;
writeJson(FILES.desktopPkg, desktopPkg);

const tauriConf = readJson(FILES.tauriConf);
tauriConf.version = target;
writeJson(FILES.tauriConf, tauriConf);

const cargoSource = readFileSync(FILES.cargoToml, "utf-8");
const cargoPatched = cargoSource.replace(
  /^version\s*=\s*"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?"\s*$/m,
  `version = "${target}"`,
);
if (cargoPatched === cargoSource) {
  fail(`failed to locate version line in ${FILES.cargoToml}`);
}
writeFileSync(FILES.cargoToml, cargoPatched);

const changelog = readFileSync(FILES.changelog, "utf-8");

const unreleasedHeader = /^## \[Unreleased\]\s*$/m;
const unreleasedMatch = unreleasedHeader.exec(changelog);
if (!unreleasedMatch) {
  fail("CHANGELOG.md must contain a '## [Unreleased]' section header.");
}

const releasedSectionStart = changelog.indexOf("\n## [", unreleasedMatch.index + 1);
const unreleasedBody = changelog.slice(
  unreleasedMatch.index + unreleasedMatch[0].length,
  releasedSectionStart === -1 ? changelog.length : releasedSectionStart,
);
const trimmedUnreleasedBody = unreleasedBody.replace(/^\n+|\n+$/g, "");

const newReleasedHeader = `## [${target}] - ${todayIso()}`;
const promotedSection =
  trimmedUnreleasedBody.length > 0
    ? `${newReleasedHeader}\n\n${trimmedUnreleasedBody}\n\n`
    : `${newReleasedHeader}\n\n`;

const beforeUnreleased = changelog.slice(0, unreleasedMatch.index);
const afterUnreleased =
  releasedSectionStart === -1 ? "" : changelog.slice(releasedSectionStart + 1);

let nextChangelog =
  `${beforeUnreleased}## [Unreleased]\n\n${promotedSection}${afterUnreleased}`.replace(
    /\n{3,}/g,
    "\n\n",
  );

const compareRoot = "https://github.com/kyungseopk1m/lawcalc-kr/compare";
const tagRoot = "https://github.com/kyungseopk1m/lawcalc-kr/releases/tag";

if (/^\[Unreleased\]: /m.test(nextChangelog)) {
  nextChangelog = nextChangelog.replace(
    /^\[Unreleased\]: .*$/m,
    `[Unreleased]: ${compareRoot}/v${target}...HEAD`,
  );
}

const compareLine = `[${target}]: ${compareRoot}/v${previous}...v${target}`;
if (!nextChangelog.includes(`[${target}]:`)) {
  nextChangelog = nextChangelog.replace(
    /^\[Unreleased\]: .*$/m,
    (line) => `${line}\n${compareLine}`,
  );
}

writeFileSync(FILES.changelog, nextChangelog);

console.log(`bump-version: ${previous} -> ${target}`);
console.log(`  - ${FILES.desktopPkg}`);
console.log(`  - ${FILES.tauriConf}`);
console.log(`  - ${FILES.cargoToml}`);
console.log(`  - ${FILES.changelog} (promoted Unreleased and added compare link)`);
console.log("next steps:");
console.log(`  pnpm install`);
console.log(`  pnpm --filter @lawcalc-kr/desktop build`);
console.log(`  git diff --stat`);
console.log(`  git commit and tag v${target}`);
