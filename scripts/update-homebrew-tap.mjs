#!/usr/bin/env node
// Update the external Homebrew tap after a lawcalc-kr release build.
//
// Intended environment:
//   GITHUB_REPOSITORY=kyungseopk1m/lawcalc-kr
//   GITHUB_REF_NAME=v0.4.0
//   GH_TOKEN=<token with contents + pull_request write access to the tap repo>
//   TAP_REPOSITORY=kyungseopk1m/homebrew-lawcalc-kr
//
// The script downloads release assets, verifies the macOS updater archive
// signature with the public key committed in tauri.conf.json, computes the
// .dmg sha256 for Homebrew, then opens a PR against the tap repository.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TAURI_CONF = path.join(ROOT, "apps/desktop/src-tauri/tauri.conf.json");

const SOURCE_REPOSITORY = process.env.GITHUB_REPOSITORY ?? "kyungseopk1m/lawcalc-kr";
const TAG = process.env.GITHUB_REF_NAME;
const TAP_REPOSITORY = process.env.TAP_REPOSITORY ?? "kyungseopk1m/homebrew-lawcalc-kr";
const TOKEN = process.env.GH_TOKEN;
const TAP_BASE_BRANCH = process.env.TAP_BASE_BRANCH ?? "main";

function fail(message) {
  console.error(`update-homebrew-tap: ${message}`);
  process.exit(1);
}

if (!TAG || !/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(TAG)) {
  fail(`GITHUB_REF_NAME must be a release tag such as v0.4.0 (got ${String(TAG)})`);
}

if (!TOKEN) {
  fail("GH_TOKEN is required to read release assets and open the tap PR.");
}

const VERSION = TAG.slice(1);
const DMG_NAME = `LawCalc.Korea_${VERSION}_universal.dmg`;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: options.encoding ?? "utf-8",
    stdio: options.stdio ?? "pipe",
  });
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lawcalc-kr-homebrew-tap-updater",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function githubAsset(asset) {
  const response = await fetch(asset.url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lawcalc-kr-homebrew-tap-updater",
    },
  });
  if (!response.ok) {
    throw new Error(`${asset.name} -> ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function assetByName(release, name) {
  const asset = release.assets.find((candidate) => candidate.name === name);
  if (!asset) {
    fail(`release ${TAG} does not contain required asset: ${name}`);
  }
  return asset;
}

function updaterArchiveAsset(release) {
  const asset = release.assets.find(
    (candidate) => candidate.name.includes("LawCalc") && candidate.name.endsWith(".app.tar.gz"),
  );
  if (!asset) {
    fail(`release ${TAG} does not contain a macOS updater archive (*.app.tar.gz)`);
  }
  return asset;
}

function updaterSignatureAsset(release, archiveName) {
  const asset =
    release.assets.find((candidate) => candidate.name === `${archiveName}.sig`) ??
    release.assets.find(
      (candidate) =>
        candidate.name.includes("LawCalc") && candidate.name.endsWith(".app.tar.gz.sig"),
    );
  if (!asset) {
    fail(`release ${TAG} does not contain a macOS updater signature (*.app.tar.gz.sig)`);
  }
  return asset;
}

function writeCask(version, sha256) {
  return `cask "lawcalc-korea" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/kyungseopk1m/lawcalc-kr/releases/download/v#{version}/LawCalc.Korea_#{version}_universal.dmg",
      verified: "github.com/kyungseopk1m/lawcalc-kr/"
  name "LawCalc Korea"
  desc "한국 법률 계산 데스크톱 워크벤치"
  homepage "https://github.com/kyungseopk1m/lawcalc-kr"

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "LawCalc Korea.app"

  caveats <<~EOS
    v#{version}은 Apple notarization을 아직 진행하지 않았습니다.
    처음 실행할 때 Gatekeeper 경고가 표시되면 Finder에서 Control-클릭 후 열기를 선택하거나
    시스템 설정 -> 개인정보 보호 및 보안에서 실행을 허용해 주세요.
  EOS

  zap trash: [
    "~/Library/Application Support/lawcalc-kr",
    "~/Library/Preferences/com.kyungseopk1m.lawcalc-kr.plist",
  ]
end
`;
}

function decodedUpdaterPublicKey() {
  const conf = JSON.parse(readFileSync(TAURI_CONF, "utf-8"));
  const encoded = conf.plugins?.updater?.pubkey;
  if (typeof encoded !== "string" || encoded.length === 0) {
    fail(`missing plugins.updater.pubkey in ${path.relative(ROOT, TAURI_CONF)}`);
  }
  return Buffer.from(encoded, "base64").toString("utf-8");
}

async function main() {
  const release = await githubJson(
    `https://api.github.com/repos/${SOURCE_REPOSITORY}/releases/tags/${TAG}`,
  );

  const dmg = await githubAsset(assetByName(release, DMG_NAME));
  const updateArchiveMetadata = updaterArchiveAsset(release);
  const updateSignatureMetadata = updaterSignatureAsset(release, updateArchiveMetadata.name);
  const updateArchive = await githubAsset(updateArchiveMetadata);
  const updateSignature = await githubAsset(updateSignatureMetadata);

  const workDir = mkdtempSync(path.join(tmpdir(), "lawcalc-homebrew-tap-"));
  const archivePath = path.join(workDir, updateArchiveMetadata.name);
  const signaturePath = path.join(workDir, updateSignatureMetadata.name);
  const pubkeyPath = path.join(workDir, "lawcalc-kr-minisign.pub");
  writeFileSync(archivePath, updateArchive);
  writeFileSync(signaturePath, updateSignature);
  writeFileSync(pubkeyPath, decodedUpdaterPublicKey());

  run("minisign", ["-Vm", archivePath, "-x", signaturePath, "-p", pubkeyPath], {
    cwd: workDir,
    stdio: "inherit",
  });

  const sha256 = createHash("sha256").update(dmg).digest("hex");
  const cloneUrl = `https://x-access-token:${TOKEN}@github.com/${TAP_REPOSITORY}.git`;
  const tapDir = path.join(workDir, "tap");
  run("git", ["clone", cloneUrl, tapDir], { cwd: workDir, stdio: "inherit" });

  const casksDir = path.join(tapDir, "Casks");
  if (!existsSync(casksDir)) {
    mkdirSync(casksDir, { recursive: true });
  }
  writeFileSync(path.join(casksDir, "lawcalc-korea.rb"), writeCask(VERSION, sha256));

  const status = run("git", ["status", "--porcelain"], { cwd: tapDir }).trim();
  if (!status) {
    console.log(`update-homebrew-tap: tap already up to date for ${TAG}.`);
    rmSync(workDir, { recursive: true, force: true });
    return;
  }

  const branch = `update-lawcalc-korea-${TAG}`;
  run("git", ["checkout", "-B", branch], { cwd: tapDir, stdio: "inherit" });
  run("git", ["config", "user.name", "github-actions[bot]"], { cwd: tapDir });
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], {
    cwd: tapDir,
  });
  run("git", ["add", "Casks/lawcalc-korea.rb"], { cwd: tapDir });
  run("git", ["commit", "-m", `Update LawCalc Korea to ${TAG}`], {
    cwd: tapDir,
    stdio: "inherit",
  });
  run("git", ["push", "--force-with-lease", "origin", branch], {
    cwd: tapDir,
    stdio: "inherit",
  });

  run(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      TAP_REPOSITORY,
      "--base",
      TAP_BASE_BRANCH,
      "--head",
      branch,
      "--title",
      `Update LawCalc Korea to ${TAG}`,
      "--body",
      [
        `Updates the LawCalc Korea Cask to ${TAG}.`,
        "",
        `- macOS updater archive minisign verification: passed`,
        `- DMG sha256: ${sha256}`,
      ].join("\n"),
    ],
    { cwd: tapDir, stdio: "inherit" },
  );

  rmSync(workDir, { recursive: true, force: true });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
