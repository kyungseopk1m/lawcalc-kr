/**
 * Build platform icon assets from a single raster master.
 *
 * Input:
 *   apps/desktop/src-tauri/icons/icon-source.png  (1254×1254, brand-final raster)
 *
 * Outputs (apps/desktop/src-tauri/icons/):
 *   PNG:   16x16, 32x32, 64x64, 128x128, 128x128@2x (256), 256x256, 512x512, 1024x1024
 *   ICO:   icon.ico (16/32/48/64/128/256 multi-res)
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
const masterPng = resolve(iconsDir, "icon-source.png");

// Trim outer white padding from the source raster (designer exported the
// rounded square on a near-white background) and apply a Big-Sur-style
// rounded-rect alpha mask so the icon sits cleanly on Dock / Finder /
// Windows shell instead of showing a square white halo around the navy.
const ROUNDED_RADIUS_RATIO = 0.2237; // macOS Big Sur convention.

async function renderPngBuffer(srcPath, size) {
  const { data, info } = await sharp(srcPath)
    .trim({ background: "#fefefe", threshold: 10 })
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const radius = Math.round(size * ROUNDED_RADIUS_RATIO);
  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>` +
      `</svg>`,
  );

  // Tauri's `generate_context!` macro requires RGBA; the dest-in composite +
  // raw round-trip together guarantee a 4-channel output regardless of which
  // pixels turned out fully opaque.
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .composite([{ input: maskSvg, blend: "dest-in" }])
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
  if (!existsSync(masterPng)) {
    throw new Error(`Master raster not found: ${masterPng}`);
  }

  console.log("Building icon assets…");

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
    await renderPng(masterPng, size, resolve(iconsDir, name));
  }

  // Windows .ico (multi-res: 16, 32, 48, 64, 128, 256).
  console.log("→ icon.ico (multi-res):");
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(icoSizes.map((s) => renderPngBuffer(masterPng, s)));
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
    await renderPng(masterPng, size, resolve(iconsetDir, name));
  }
  const icnsPath = resolve(iconsDir, "icon.icns");
  execSync(`iconutil -c icns -o "${icnsPath}" "${iconsetDir}"`, { stdio: "inherit" });
  rmSync(iconsetDir, { recursive: true });
  console.log(`  ${icnsPath.replace(repoRoot + "/", "")}`);

  // In-app Header brand mark (retina-ready: 64×64 @2x = 128×128).
  console.log("→ in-app brand mark:");
  if (!existsSync(brandAssetsDir)) mkdirSync(brandAssetsDir, { recursive: true });
  await renderPng(masterPng, 128, resolve(brandAssetsDir, "lc-mark.png"));

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
