// Generate Melobi's app icons from the orb art (same shapes and colours as src/components/mascot/MynaBot.tsx).
//
//   node tools/make-icons.ts
//
// Writes:
//   public/icons/icon-{192,512}.png            manifest "any" icons (yellow tile, big orb)
//   public/icons/icon-maskable-{192,512}.png   manifest "maskable" icons (orb inside the 80% safe circle)
//   src/app/apple-icon.png                     180×180 apple-touch-icon (iOS adds the rounded corners; no transparency)
//   src/app/icon.svg                           browser-tab icon (orb only, transparent)
//   src/app/favicon.ico                        16/32/48 px PNG-in-ICO fallback
//
// Uses sharp (installed with Next.js) to rasterise the SVG. Original art: a glossy violet orb with two pill eyes.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TILE = "#f2b705"; // --primary (myna-beak yellow)
const TILE_LIGHT = "#ffd34d";

/** The orb in its own 120-unit box (centre 60,60, r 48), idle face. */
const ORB = `
  <defs>
    <radialGradient id="body" cx="38%" cy="30%" r="75%">
      <stop offset="0" stop-color="#a99bff"/>
      <stop offset=".45" stop-color="#6f55f2"/>
      <stop offset="1" stop-color="#3f25b8"/>
    </radialGradient>
    <radialGradient id="rim" cx="50%" cy="50%" r="50%">
      <stop offset=".72" stop-color="#2a1580" stop-opacity="0"/>
      <stop offset="1" stop-color="#2a1580" stop-opacity=".45"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="48" fill="url(#body)"/>
  <circle cx="60" cy="60" r="48" fill="url(#rim)"/>
  <ellipse cx="40" cy="32" rx="15" ry="8" fill="#fff" opacity=".42" transform="rotate(-24 40 32)"/>
  <rect x="42" y="44" width="11" height="24" rx="5.5" fill="#17122e"/>
  <rect x="67" y="44" width="11" height="24" rx="5.5" fill="#17122e"/>
  <path d="M53 80q7 5 14 0" fill="none" stroke="#17122e" stroke-width="4" stroke-linecap="round"/>`;

/**
 * Square SVG, `size` px. `orbShare` = orb diameter / canvas. `tile` adds the yellow background (needed for home-screen
 * icons: iOS fills transparency with black).
 */
function iconSvg(size: number, orbShare: number, tile: boolean): string {
  const d = 96; // orb diameter in its own units
  const scale = (size * orbShare) / d;
  const offset = size / 2 - 60 * scale;
  const shadow = tile
    ? `<ellipse cx="${size / 2}" cy="${size / 2 + 50 * scale}" rx="${30 * scale}" ry="${5 * scale}" fill="#7a5600" opacity=".22"/>`
    : "";
  const bg = tile
    ? `<defs><radialGradient id="tile" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="${TILE_LIGHT}"/><stop offset="1" stop-color="${TILE}"/></radialGradient></defs>
       <rect width="${size}" height="${size}" fill="url(#tile)"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}${shadow}
  <g transform="translate(${offset} ${offset}) scale(${scale})">${ORB}</g>
</svg>`;
}

/** Rasterise; `opaque` flattens onto the tile colour so home-screen icons have no alpha channel. */
async function png(svg: string, size: number, opaque = true): Promise<Buffer> {
  const img = sharp(Buffer.from(svg), { density: 72 }).resize(size, size);
  return (opaque ? img.flatten({ background: TILE }) : img).png({ compressionLevel: 9 }).toBuffer();
}

/** ICO container holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const img of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

function write(rel: string, data: string | Buffer) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`wrote ${rel} (${data.length} bytes)`);
}

for (const size of [192, 512]) {
  write(`public/icons/icon-${size}.png`, await png(iconSvg(size, 0.74, true), size));
  write(`public/icons/icon-maskable-${size}.png`, await png(iconSvg(size, 0.6, true), size));
}
write("src/app/apple-icon.png", await png(iconSvg(180, 0.72, true), 180));
write("src/app/icon.svg", iconSvg(120, 0.98, false));
write("src/app/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(iconSvg(s * 4, 0.98, false), s, false) })))));
