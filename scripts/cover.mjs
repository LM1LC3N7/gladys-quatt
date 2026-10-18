// -----------------------------------------------------------------------------
// Generates cover.png (800×534, the store size): a cool-to-warm gradient, the
// outdoor unit of a heat pump with its fan, a small control box (the CiC)
// with its display, a boiler with a flame, linked by a hot (red) and a return
// (blue) pipe. Plain Node (zlib), no dependency. Run: npm run cover
// -----------------------------------------------------------------------------

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const WIDTH = 800;
const HEIGHT = 534;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))));
const smooth = (edge, distance) => Math.min(1, Math.max(0, edge - distance + 0.5));

const NIGHT = [18, 32, 52];
const DUSK = [70, 40, 64];
const WHITE = [240, 242, 246];
const STEEL = [176, 186, 200];
const GRILLE = [52, 62, 78];
const SCREEN = [20, 34, 48];
const GREEN = [96, 220, 140];
const ORANGE = [255, 140, 40];
const YELLOW = [255, 214, 90];
const RED = [232, 76, 60];
const BLUE = [70, 150, 240];

/** Distance from a point to a rounded rectangle (negative inside). */
function roundedBox(x, y, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(x - cx) - halfW + radius;
  const qy = Math.abs(y - cy) - halfH + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance to a segment. */
function segment(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

/** A cabinet: a steel outline around a white body. */
function cabinet(color, distance) {
  color = mix(color, STEEL, smooth(0, Math.abs(distance) - 2));
  return mix(color, WHITE, smooth(0, distance + 2));
}

function pixel(x, y) {
  let color = mix(NIGHT, DUSK, (x / WIDTH) * 0.7 + (y / HEIGHT) * 0.3);

  // The pipes first (behind the cabinets): hot supply above, return below.
  for (const [y0, tint] of [
    [300, RED],
    [340, BLUE],
  ]) {
    color = mix(color, tint, smooth(6, segment(x, y, 250, y0, 600, y0)));
  }

  // The outdoor unit: a wide cabinet with a round fan grille.
  color = cabinet(color, roundedBox(x, y, 170, 300, 130, 110, 14));
  const fan = Math.hypot(x - 150, y - 300);
  color = mix(color, GRILLE, smooth(80, fan));
  if (fan < 80) {
    const angle = Math.atan2(y - 300, x - 150);
    const blade = Math.abs(Math.sin(angle * 3 + fan / 30));
    color = mix(color, STEEL, smooth(0.5, blade * 3 - (fan > 14 ? 0 : 3)) * 0.8);
    for (const r of [40, 62]) color = mix(color, GRILLE, smooth(2, Math.abs(fan - r)));
  }
  color = mix(color, STEEL, smooth(12, fan));
  // Side vents of the outdoor unit.
  for (const vy of [240, 270, 300, 330, 360]) {
    color = mix(color, GRILLE, smooth(2.5, segment(x, y, 252, vy, 282, vy)));
  }

  // The CiC: a small box on the pipes, with a display and a green light.
  color = cabinet(color, roundedBox(x, y, 420, 230, 62, 44, 10));
  color = mix(color, SCREEN, smooth(0, roundedBox(x, y, 410, 226, 38, 22, 5)));
  // "4.2" (a COP) drawn as segments on the display.
  const DIGITS = [
    [386, 214, 386, 226],
    [386, 226, 398, 226],
    [398, 214, 398, 238],
    [404, 238, 405, 238],
    [412, 214, 424, 214],
    [424, 214, 424, 226],
    [424, 226, 412, 226],
    [412, 226, 412, 238],
    [412, 238, 424, 238],
  ];
  for (const [x0, y0, x1, y1] of DIGITS) {
    color = mix(color, GREEN, smooth(2, segment(x, y, x0, y0, x1, y1)));
  }
  color = mix(color, GREEN, smooth(5, Math.hypot(x - 462, y - 226)));
  // The cable from the CiC down to the pipes.
  color = mix(color, STEEL, smooth(3, segment(x, y, 420, 274, 420, 296)));

  // The boiler: a tall cabinet with a flame window.
  color = cabinet(color, roundedBox(x, y, 650, 290, 90, 150, 16));
  const window = roundedBox(x, y, 650, 320, 44, 56, 22);
  color = mix(color, SCREEN, smooth(0, window));
  if (window < 0) {
    const fx = (x - 650) / 28;
    const fy = (y - 344) / 40;
    const flame = fx * fx + fy * fy * (fy < 0 ? 0.55 : 1.6);
    color = mix(color, ORANGE, smooth(1, flame * 26 - 20));
    const core = fx * fx * 2.4 + (fy + 0.15) ** 2 * (fy < -0.15 ? 1.1 : 3.2);
    color = mix(color, YELLOW, smooth(1, core * 26 - 18));
  }
  color = mix(color, SCREEN, smooth(0, roundedBox(x, y, 650, 200, 50, 16, 5)));
  color = mix(color, ORANGE, smooth(2.5, segment(x, y, 620, 200, 680, 200)));
  return color;
}

const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  const row = y * (WIDTH * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < WIDTH; x += 1) {
    const [r, g, b] = pixel(x, y);
    raw.set([r, g, b], row + 1 + x * 3);
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 2; // RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../cover.png', import.meta.url), png);
console.log(`cover.png: ${WIDTH}×${HEIGHT}, ${png.length} bytes`);
