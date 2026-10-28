// Generates icons/fitness-v1-*.png (no dependencies): coral→orange gradient tile with a dumbbell.
// Same family as Habits: rounded square, radius 23 %, warm-white symbol. "any" icons keep transparent
// corners; maskable / apple-touch are full-bleed (iOS fills transparency with black and rounds the
// corners itself); the symbol lies inside the 80 % safe circle. Geometry in 0..100
// units, matching icons/fitness-v1.svg. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = new URL('../icons/', import.meta.url);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const GRADIENT = ['#ffa36c', '#f0603f'];     // top-left → bottom-right
const INK = hex('#fffaf4');
// Dumbbell: bar + two pairs of plates, as [x0, y0, x1, y1, corner radius] boxes.
const BOXES = [[21, 46.8, 79, 53.2, 3.2], [27, 30, 37, 70, 5], [63, 30, 73, 70, 5], [16.5, 37, 25.5, 63, 4.5], [74.5, 37, 83.5, 63, 4.5]];

// ---- PNG encoding ------------------------------------------------------

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;                    // bit depth
  ihdr[9] = 6;                    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Geometry ----------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Signed distance to a rounded box [x0, y0, x1, y1] with corner radius r. */
function rbox(u, v, [x0, y0, x1, y1, r]) {
  const qx = Math.abs(u - (x0 + x1) / 2) - (x1 - x0) / 2 + r;
  const qy = Math.abs(v - (y0 + y1) / 2) - (y1 - y0) / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Signed distance to a rounded square spanning 1..99 with radius 23. */
function tile(u, v) {
  const q = (p) => Math.abs(p - 50) - 49 + 23;
  const qx = q(u);
  const qy = q(v);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 23;
}

/** Straight-alpha "over" compositing into dst = [r, g, b, a]. */
function over(dst, rgb, a) {
  if (a <= 0) return;
  const outA = a + dst[3] * (1 - a);
  for (let i = 0; i < 3; i++) dst[i] = (rgb[i] * a + dst[i] * dst[3] * (1 - a)) / outA;
  dst[3] = outA;
}

export function draw(size, fullBleed) {
  const s = size / 100;
  const px1 = 1 / s;
  const cover = (d) => clamp01(-d / px1 + 0.5);
  const [ga, gb] = GRADIENT.map(hex);
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      const c = [0, 0, 0, 0];
      over(c, lerp(ga, gb, clamp01((u + v - 10) / 180)), fullBleed ? 1 : cover(tile(u, v)));
      over(c, INK, cover(Math.min(...BOXES.map((b) => rbox(u, v, b)))));
      out.set(c.map((ch, i) => Math.round(i === 3 ? ch * 255 : ch)), (y * size + x) * 4);
    }
  }
  return png(size, out);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(OUT, { recursive: true });
  // Names carry the design version: devices cache icons by URL, so a redesign needs new names.
  const ICONS = [
    ['fitness-v1-192.png', 192, false],
    ['fitness-v1-512.png', 512, false],
    ['fitness-v1-maskable-512.png', 512, true],
    ['fitness-v1-apple-180.png', 180, true],
  ];
  for (const [name, size, fullBleed] of ICONS) {
    writeFileSync(new URL(name, OUT), draw(size, fullBleed));
    console.log('wrote icons/' + name);
  }
}
