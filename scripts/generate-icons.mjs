import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets/app-icon');
const outDir = join(root, 'assets/images');
const webDir = join(root, 'website/assets');
const webRootDir = join(root, 'website');

const sourceSvg = readFileSync(join(srcDir, 'icon-1024.svg'), 'utf8');

// Variant: monochrome — replace black fill with white (themed Android icons recolor white)
const monoSvg = sourceSvg
  .replace(/fill="#FFFFFF"/g, 'fill="none"')
  .replace(/fill="#000000"/g, 'fill="#FFFFFF"');

// Variant: transparent foreground (no white bg) — original glyph on transparent canvas
const fgSvg = sourceSvg.replace(/<rect[^/]*\/>/, '');

// Adaptive icon foreground needs ~66% safe zone. Render the glyph at smaller scale.
const fgSafeSvg = fgSvg.replace(/scale\(9\)/, 'scale(6)');

// iOS / shared master — 1024×1024 white background, black glyph
async function buildIos() {
  await sharp(Buffer.from(sourceSvg))
    .resize(1024, 1024)
    .png()
    .toFile(join(outDir, 'icon.png'));
  console.log('✓ icon.png (1024×1024)');
}

// Android adaptive: foreground (transparent, with safe zone)
async function buildAndroidForeground() {
  await sharp(Buffer.from(fgSafeSvg))
    .resize(1024, 1024)
    .png()
    .toFile(join(outDir, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png (1024×1024)');
}

// Android adaptive: background (solid color matching app.json #E6F4FE)
async function buildAndroidBackground() {
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 230, g: 244, b: 254, alpha: 1 },
    },
  })
    .png()
    .toFile(join(outDir, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png (1024×1024)');
}

// Android themed: white-on-transparent
async function buildAndroidMonochrome() {
  const monoSafe = monoSvg.replace(/scale\(9\)/, 'scale(6)');
  await sharp(Buffer.from(monoSafe))
    .resize(1024, 1024)
    .png()
    .toFile(join(outDir, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png (1024×1024)');
}

// Web favicon — 192×192 PNG (Expo serves this for web)
async function buildFavicon() {
  await sharp(Buffer.from(sourceSvg))
    .resize(192, 192)
    .png()
    .toFile(join(outDir, 'favicon.png'));
  console.log('✓ favicon.png (192×192)');
}

// Splash — transparent bg so it composites cleanly on whatever splash color is set.
async function buildSplash() {
  await sharp(Buffer.from(fgSvg))
    .resize(1024, 1024)
    .png()
    .toFile(join(outDir, 'splash-icon.png'));
  console.log('✓ splash-icon.png (1024×1024, transparent)');
}

// Marketing site (website/) — favicon, og:image, and Apple touch icon.
// Favicons live at the site root so browsers' implicit /favicon.ico request
// resolves to the NoteCal glyph (not a gray default) during reload.
async function buildWebsite() {
  const faviconPng = await sharp(Buffer.from(sourceSvg))
    .resize(32, 32)
    .png()
    .toBuffer();

  await sharp(faviconPng).toFile(join(webRootDir, 'favicon.png'));
  await sharp(faviconPng).toFile(join(webRootDir, 'favicon.ico'));
  console.log('✓ website/favicon.{png,ico} (32×32)');

  await sharp(Buffer.from(sourceSvg))
    .resize(180, 180)
    .png()
    .toFile(join(webDir, 'apple-touch-icon.png'));
  console.log('✓ website/assets/apple-touch-icon.png (180×180)');

  await sharp(Buffer.from(sourceSvg))
    .resize(1024, 1024)
    .png()
    .toFile(join(webDir, 'icon.png'));
  console.log('✓ website/assets/icon.png (1024×1024)');
}

await buildIos();
await buildAndroidForeground();
await buildAndroidBackground();
await buildAndroidMonochrome();
await buildFavicon();
await buildSplash();
await buildWebsite();
