/**
 * Build platform icon assets from canonical SVG sources.
 *
 * Inputs (apps/desktop/src-tauri/icons/sources/):
 *   signature-lc.svg        (all platforms, 48px and larger)
 *   signature-lc-small.svg  (all platforms, 32px and smaller)
 *
 * Outputs (apps/desktop/src-tauri/icons/):
 *   Source: icon-source.png (1254×1254 compatibility raster)
 *   PNG:   16x16, 32x32, 64x64, 128x128, 128x128@2x (256), 256x256, 512x512, 1024x1024
 *   ICO:   icon.ico (16/24/32/48/64/128/256 multi-res)
 *   ICNS:  icon.icns (iconutil, 16~1024 multi-res)
 *
 * Outputs (apps/desktop/src/assets/brand/):
 *   PNG:   lc-mark.png (128×128, in-app Header brand mark — retina-ready 64@2x)
 *
 * Run: pnpm build:icons
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const iconsDir = resolve(repoRoot, "apps/desktop/src-tauri/icons");
const brandAssetsDir = resolve(repoRoot, "apps/desktop/src/assets/brand");
const sourcesDir = resolve(iconsDir, "sources");
const masterPng = resolve(iconsDir, "icon-source.png");
const sources = {
  large: resolve(sourcesDir, "signature-lc.svg"),
  small: resolve(sourcesDir, "signature-lc-small.svg"),
};

function selectSource(size) {
  return size <= 32 ? sources.small : sources.large;
}

async function renderPngBuffer(srcPath, size) {
  // Small-design SVGs have a 16px intrinsic canvas. Raising SVG density before
  // rasterisation keeps their integer geometry crisp at 24px and 32px.
  const density = srcPath.endsWith("-small.svg") ? 72 * Math.max(1, size / 16) : 72;

  // Render the complete SVG canvas directly so the canonical plate geometry
  // and its transparent outer margin stay identical on every platform.
  return sharp(srcPath, { density })
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderPng(srcPath, size, outPath) {
  const buf = await renderPngBuffer(srcPath, size);
  writeFileSync(outPath, buf);
  console.log(`  ${outPath.replace(repoRoot + "/", "")} — ${size}×${size} (${buf.length} bytes)`);
  return buf;
}

async function main() {
  for (const srcPath of Object.values(sources)) {
    if (!existsSync(srcPath)) {
      throw new Error(`Canonical vector not found: ${srcPath}`);
    }
  }

  console.log("Building icon assets…");

  console.log("→ compatibility source raster:");
  await renderPng(sources.large, 1254, masterPng);

  // Tauri-required PNG set + extras for icns/ico inputs.
  const pngSpecs = [
    { name: "16x16.png", size: 16 },
    { name: "32x32.png", size: 32 },
    { name: "64x64.png", size: 64 },
    { name: "128x128.png", size: 128 },
    { name: "128x128@2x.png", size: 256 },
    { name: "256x256.png", size: 256 },
    { name: "512x512.png", size: 512 },
    { name: "1024x1024.png", size: 1024 },
  ];
  console.log("→ PNG raster:");
  for (const { name, size } of pngSpecs) {
    await renderPng(selectSource(size), size, resolve(iconsDir, name));
  }

  // Windows .ico retains the same signature plate at each shell size.
  console.log("→ icon.ico (multi-res):");
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) => renderPngBuffer(selectSource(size), size)),
  );
  const icoBuf = await pngToIco(icoBuffers);
  const icoPath = resolve(iconsDir, "icon.ico");
  writeFileSync(icoPath, icoBuf);
  console.log(
    `  ${icoPath.replace(repoRoot + "/", "")} — ${icoSizes.join("/")} (${icoBuf.length} bytes)`,
  );

  // macOS .icns via native iconutil.
  console.log("→ icon.icns (iconutil):");
  const iconsetDir = resolve(iconsDir, "icon.iconset");
  if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
  mkdirSync(iconsetDir);
  const icnsSpecs = [
    { name: "icon_16x16.png", size: 16 },
    { name: "icon_16x16@2x.png", size: 32 },
    { name: "icon_32x32.png", size: 32 },
    { name: "icon_32x32@2x.png", size: 64 },
    { name: "icon_128x128.png", size: 128 },
    { name: "icon_128x128@2x.png", size: 256 },
    { name: "icon_256x256.png", size: 256 },
    { name: "icon_256x256@2x.png", size: 512 },
    { name: "icon_512x512.png", size: 512 },
    { name: "icon_512x512@2x.png", size: 1024 },
  ];
  for (const { name, size } of icnsSpecs) {
    await renderPng(selectSource(size), size, resolve(iconsetDir, name));
  }
  const icnsPath = resolve(iconsDir, "icon.icns");
  execSync(`iconutil -c icns -o "${icnsPath}" "${iconsetDir}"`, { stdio: "inherit" });
  rmSync(iconsetDir, { recursive: true });
  console.log(`  ${icnsPath.replace(repoRoot + "/", "")}`);

  // In-app Header brand mark (retina-ready: 64×64 @2x = 128×128).
  console.log("→ in-app brand mark:");
  if (!existsSync(brandAssetsDir)) mkdirSync(brandAssetsDir, { recursive: true });
  await renderPng(sources.large, 128, resolve(brandAssetsDir, "lc-mark.png"));

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
