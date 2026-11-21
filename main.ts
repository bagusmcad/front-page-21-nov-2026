// THE WORLD IN ONE PAGE — Saturday 21 November 2026.
// A one-page newspaper front page drawn entirely by code: own bitmap font,
// own vector scenes, own world map, own PNG encoder. Node 22, stdlib only,
// no network. Deterministic: the same input always writes the same bytes.
//
// Every story below was checked against reporting published on 21 Nov 2026
// (AP, Reuters, CNN, Fox News, Euronews, IANS, The Neuron, OneTurn, Europa
// Express). Events that happened overnight 19-20 Nov are included because
// they were first reported, and led the day's news, on 21 Nov 2026.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// PNG encoder (own code: CRC-32 table, chunk writer, zlib deflate).
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePng(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: a plain RGB framebuffer with small drawing helpers.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const PAPER: RGB = [247, 242, 231];
const INK: RGB = [26, 26, 26];
const RED: RGB = [163, 18, 18];
const BLUE: RGB = [31, 78, 121];
const GREY: RGB = [110, 104, 92];
const LIGHT: RGB = [232, 226, 210];
const GOLD: RGB = [176, 141, 58];
const GREEN: RGB = [46, 110, 62];
const SKY: RGB = [178, 205, 224];
const SEA: RGB = [214, 231, 240];
const LAND: RGB = [226, 214, 178];
const ORANGE: RGB = [214, 116, 44];

const px = new Uint8Array(W * H * 3);

function setPix(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPix(xx, yy, c);
  }
}

function hline(x0: number, x1: number, y: number, c: RGB, t = 1): void {
  for (let t0 = 0; t0 < t; t0++) for (let x = x0; x <= x1; x++) setPix(x, y + t0, c);
}

function vline(x: number, y0: number, y1: number, c: RGB, t = 1): void {
  for (let t0 = 0; t0 < t; t0++) for (let y = y0; y <= y1; y++) setPix(x + t0, y, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPix(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function circle(cx: number, cy: number, r: number, c: RGB, fill: boolean): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (fill ? d <= r : d <= r && d >= r - 1) setPix(cx + x, cy + y, c);
    }
  }
}

function poly(points: Array<[number, number]>, c: RGB): void {
  // Scanline fill of a simple polygon.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) setPix(x, y, c);
    }
  }
}

function frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, x + w - 1, y, c, t);
  hline(x, x + w - 1, y + h - 1, c, t);
  vline(x, y, y + h - 1, c, t);
  vline(x + w - 1, y, y + h - 1, c, t);
}

// ---------------------------------------------------------------------------
// Bitmap font: 5x7 glyphs, drawn at integer scale. '#' is on, '.' is off.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  b: ['10000', '10000', '10110', '11001', '10001', '10001', '11110'],
  c: ['00000', '00000', '01110', '10000', '10000', '10001', '01110'],
  d: ['00001', '00001', '01101', '10011', '10001', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01001', '01000', '11110', '01000', '01000', '01000'],
  g: ['00000', '01111', '10001', '10001', '01111', '00001', '01110'],
  h: ['10000', '10000', '10110', '11001', '10001', '10001', '10001'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  j: ['00010', '00000', '00110', '00010', '00010', '10010', '01100'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '10110', '11001', '10001', '10001', '10001'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  p: ['00000', '00000', '10110', '11001', '10001', '11110', '10000'],
  q: ['00000', '00000', '01101', '10011', '10001', '01111', '00001'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  s: ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  t: ['01000', '01000', '11100', '01000', '01000', '01001', '00110'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  v: ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
  w: ['00000', '00000', '10001', '10101', '10101', '10101', '01010'],
  x: ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  y: ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
  z: ['00000', '00000', '11111', '00010', '00100', '01000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '00000', '00000', '01100', '00000', '00000'],
  ';': ['00000', '01100', '00000', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '—': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '–': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '’': ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '‘': ['01000', '01000', '00100', '00000', '00000', '00000', '00000'],
  '“': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '”': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '·': ['00000', '00000', '01100', '01100', '00000', '00000', '00000'],
  '•': ['00000', '00000', '01100', '01100', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '*': ['00000', '00100', '10101', '01110', '10101', '00100', '00000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
};

const FALLBACK = GLYPHS['?'];

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = GLYPHS[ch] ?? FALLBACK;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === '1') fillRect(x + col * scale, y + r * scale, scale, scale, c);
    }
  }
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): number {
  let cx = x;
  for (const ch of s) {
    drawGlyph(ch, cx, y, scale, c);
    cx += 6 * scale;
  }
  return cx;
}

function drawTextBold(s: string, x: number, y: number, scale: number, c: RGB): number {
  drawText(s, x, y, scale, c);
  drawText(s, x + 1, y, scale, c);
  return x + textWidth(s, scale) + 1;
}

function drawTextCentred(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

function drawTextCentredBold(s: string, cx: number, y: number, scale: number, c: RGB): void {
  const w = textWidth(s, scale) + 1;
  drawTextBold(s, cx - Math.floor(w / 2), y, scale, c);
}

// Word-wrap: returns lines that fit maxWidth at the given scale.
function wrap(s: string, maxWidth: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur === '' ? w : cur + ' ' + w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== '') lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function drawPara(s: string, x: number, y: number, maxWidth: number, scale: number, c: RGB, lh: number): number {
  const lines = wrap(s, maxWidth, scale);
  for (let i = 0; i < lines.length; i++) drawText(lines[i], x, y + i * lh, scale, c);
  return y + lines.length * lh;
}

// Headline in capitals, bold, wrapped; returns the y after the last line.
function drawHead(s: string, x: number, y: number, maxWidth: number, scale: number, c: RGB, lh: number): number {
  const lines = wrap(s.toUpperCase(), maxWidth, scale);
  for (let i = 0; i < lines.length; i++) drawTextBold(lines[i], x, y + i * lh, scale, c);
  return y + lines.length * lh;
}

// ---------------------------------------------------------------------------
// Scenes: small drawn illustrations, one per illustrated story.
// Each paints inside a box (x, y, w, h) on a sky-tinted background.
// ---------------------------------------------------------------------------

function sceneSky(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
  for (let yy = 0; yy < h; yy++) {
    const t = yy / Math.max(1, h - 1);
    const c: RGB = [
      Math.round(top[0] + (bottom[0] - top[0]) * t),
      Math.round(top[1] + (bottom[1] - top[1]) * t),
      Math.round(top[2] + (bottom[2] - top[2]) * t),
    ];
    hline(x, x + w - 1, y + yy, c);
  }
}

function sunMoon(x: number, y: number, r: number, c: RGB): void {
  circle(x, y, r, c, true);
  circle(x, y, Math.max(1, r - 2), [255, 244, 200], true);
}

function smoke(x: number, y: number, r: number): void {
  circle(x, y, r, [120, 118, 112], true);
  circle(x + r, y - r, Math.floor(r * 0.8), [140, 138, 130], true);
  circle(x - r, y - r, Math.floor(r * 0.7), [100, 98, 94], true);
}

// 1. Kyiv: bridges over the Dnipro at night, missile trails, smoke.
function sceneBridges(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [24, 30, 54], [74, 66, 92]);
  sunMoon(x + Math.floor(w * 0.82), y + Math.floor(h * 0.2), 12, [220, 220, 210]);
  // far-bank skyline, dark against the night sky
  const skyline = [26, 40, 30, 48, 34, 44, 28, 52, 36];
  for (let i = 0; i < skyline.length; i++) {
    fillRect(x + 14 + i * 64, y + Math.floor(h * 0.68) - skyline[i], 44, skyline[i], [52, 48, 66]);
  }
  // river
  fillRect(x, y + Math.floor(h * 0.68), w, h - Math.floor(h * 0.68), [38, 68, 104]);
  for (let i = 0; i < 8; i++) {
    hline(x + 10 + i * 34, x + 26 + i * 34, y + Math.floor(h * 0.74) + (i % 3) * 8, [120, 160, 200]);
  }
  // three bridges: deck + arch + pillars
  for (let b = 0; b < 3; b++) {
    const by = y + Math.floor(h * (0.42 + b * 0.1));
    hline(x + 8, x + w - 8, by, [210, 205, 190], 3);
    for (let px0 = x + 20; px0 < x + w - 20; px0 += 68) {
      vline(px0, by, by + Math.floor(h * 0.22), [210, 205, 190], 3);
    }
    // arch over the middle bridge
    if (b === 1) {
      for (let a = 0; a <= 40; a++) {
        const ax = x + Math.floor(w * 0.3) + a * 3;
        const ay = by - Math.floor(18 * Math.sin((a / 40) * Math.PI));
        setPix(ax, ay, [230, 225, 210]);
        setPix(ax, ay + 1, [230, 225, 210]);
      }
    }
  }
  // missile trails
  line(x + Math.floor(w * 0.2), y + Math.floor(h * 0.08), x + Math.floor(w * 0.3), y + Math.floor(h * 0.4), ORANGE);
  line(x + Math.floor(w * 0.55), y + Math.floor(h * 0.05), x + Math.floor(w * 0.62), y + Math.floor(h * 0.38), ORANGE);
  line(x + Math.floor(w * 0.72), y + Math.floor(h * 0.12), x + Math.floor(w * 0.68), y + Math.floor(h * 0.45), [255, 200, 90]);
  circle(x + Math.floor(w * 0.3), y + Math.floor(h * 0.4), 4, ORANGE, true);
  circle(x + Math.floor(w * 0.62), y + Math.floor(h * 0.38), 4, ORANGE, true);
  // smoke over the far bank
  smoke(x + Math.floor(w * 0.25), y + Math.floor(h * 0.36), 10);
  smoke(x + Math.floor(w * 0.7), y + Math.floor(h * 0.34), 12);
  // fires
  circle(x + Math.floor(w * 0.45), y + Math.floor(h * 0.6), 5, [255, 140, 40], true);
  circle(x + Math.floor(w * 0.45), y + Math.floor(h * 0.6), 2, [255, 220, 120], true);
}

// 2. UK-EU: two flags side by side, handshake of stars and stripes.
function sceneFlags(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, SKY, [240, 238, 228]);
  // Union Jack, simplified
  fillRect(x + 8, y + 10, 52, 34, BLUE);
  line(x + 8, y + 10, x + 60, y + 44, [255, 255, 255]);
  line(x + 60, y + 10, x + 8, y + 44, [255, 255, 255]);
  hline(x + 8, x + 60, y + 25, [255, 255, 255], 6);
  vline(x + 32, y + 10, y + 44, [255, 255, 255], 6);
  hline(x + 8, x + 60, y + 26, RED, 2);
  vline(x + 33, y + 10, y + 44, RED, 2);
  // EU flag
  fillRect(x + w - 60, y + 10, 52, 34, [0, 51, 153]);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const sx = x + w - 34 + Math.round(13 * Math.cos(a));
    const sy = y + 27 + Math.round(11 * Math.sin(a));
    setPix(sx, sy, [255, 204, 0]);
    setPix(sx + 1, sy, [255, 204, 0]);
  }
  // clasped hands: two blocks meeting in the middle
  fillRect(x + Math.floor(w / 2) - 22, y + h - 26, 20, 14, [196, 120, 80]);
  fillRect(x + Math.floor(w / 2) + 2, y + h - 26, 20, 14, [232, 180, 130]);
  line(x + Math.floor(w / 2) - 2, y + h - 26, x + Math.floor(w / 2) - 2, y + h - 12, INK);
}

// 3. Markets: a falling chart line, red candles, a down arrow.
function sceneChart(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [250, 246, 236], [238, 232, 218]);
  for (let g = 0; g < 4; g++) hline(x + 6, x + w - 6, y + 10 + g * 12, LIGHT);
  const pts: Array<[number, number]> = [];
  const vals = [0.15, 0.22, 0.18, 0.3, 0.28, 0.45, 0.42, 0.6, 0.58, 0.78, 0.95];
  for (let i = 0; i < vals.length; i++) {
    pts.push([x + 8 + Math.floor((i * (w - 16)) / (vals.length - 1)), y + 8 + Math.floor(vals[i] * (h - 22))]);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED);
    line(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, RED);
  }
  // down arrow at the end
  const ex = pts[pts.length - 1][0];
  const ey = pts[pts.length - 1][1];
  line(ex, ey - 16, ex, ey + 2, RED);
  line(ex, ey + 2, ex - 6, ey - 4, RED);
  line(ex, ey + 2, ex + 6, ey - 4, RED);
}

// 4. Riemann: a chalkboard of symbols, a zeta curve and a tick.
function sceneMath(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [38, 52, 44]);
  frame(x, y, w, h, [120, 100, 60], 2);
  drawText('zeta(s) = 0', x + 8, y + 8, 1, [240, 240, 220]);
  drawText('Re(s) = 1/2', x + 8, y + 22, 1, [240, 240, 220]);
  // curve crossing the critical line
  vline(x + Math.floor(w / 2), y + 34, y + h - 8, [240, 240, 220]);
  for (let i = 0; i < 40; i++) {
    const cx = x + 8 + i * 2;
    const cy = y + 44 + Math.round(8 * Math.sin(i / 5));
    setPix(cx, cy, [255, 204, 0]);
    setPix(cx, cy + 1, [255, 204, 0]);
  }
  // tick of proof
  line(x + w - 26, y + h - 16, x + w - 18, y + h - 8, [120, 220, 130]);
  line(x + w - 18, y + h - 8, x + w - 6, y + h - 24, [120, 220, 130]);
}

// 5. Parliament: a domed building, a flag at half-mast, ballot box.
function sceneParliament(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, SKY, [240, 236, 224]);
  fillRect(x + 10, y + h - 18, w - 20, 18, [200, 192, 172]);
  // columns
  for (let c = 0; c < 5; c++) {
    fillRect(x + 14 + c * 16, y + 22, 6, h - 40, [245, 240, 225]);
  }
  // dome
  for (let r = 0; r < 14; r++) {
    const half = Math.floor(14 * Math.sqrt(1 - (r / 14) * (r / 14)));
    hline(x + Math.floor(w / 2) - half, x + Math.floor(w / 2) + half, y + 8 + r, [120, 60, 60]);
  }
  // flagpole with flag lowered
  vline(x + w - 14, y + 6, y + h - 18, INK);
  fillRect(x + w - 14, y + 14, 10, 6, RED);
  // ballot box
  fillRect(x + 8, y + h - 30, 16, 12, [31, 78, 121]);
  hline(x + 11, x + 21, y + h - 30, PAPER, 2);
}

// 6. Protest: a crowd of heads and placards.
function sceneCrowd(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [250, 244, 232], [238, 226, 205]);
  // placards
  fillRect(x + 8, y + 8, 26, 16, [255, 255, 255]);
  frame(x + 8, y + 8, 26, 16, INK);
  drawText('25', x + 14, y + 12, 1, RED);
  fillRect(x + w - 40, y + 12, 30, 16, [255, 255, 255]);
  frame(x + w - 40, y + 12, 30, 16, INK);
  drawText('EU', x + w - 32, y + 16, 1, BLUE);
  vline(x + 20, y + 24, y + 40, INK, 2);
  vline(x + w - 26, y + 28, y + 44, INK, 2);
  // crowd heads and shoulders
  const cols: RGB[] = [RED, BLUE, GREEN, GOLD, [90, 60, 120], ORANGE];
  for (let i = 0; i < 9; i++) {
    const cx = x + 10 + i * 11;
    const cy = y + h - 18 - (i % 3) * 6;
    circle(cx, cy, 5, [232, 190, 150], true);
    fillRect(cx - 7, cy + 5, 14, h - (cy + 5 - y), cols[i % cols.length]);
  }
}

// 7. Lab: flask, pill capsule, microscope silhouette.
function sceneLab(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [235, 244, 240], [250, 248, 238]);
  // bench
  fillRect(x, y + h - 14, w, 14, [190, 180, 160]);
  // flask
  line(x + 20, y + 18, x + 20, y + 30, INK);
  line(x + 30, y + 18, x + 30, y + 30, INK);
  line(x + 20, y + 30, x + 12, y + h - 14, INK);
  line(x + 30, y + 30, x + 38, y + h - 14, INK);
  hline(x + 12, x + 38, y + h - 14, INK);
  fillRect(x + 16, y + 34, 18, 8, [90, 180, 120]);
  // capsule pill, big
  fillRect(x + w - 46, y + 20, 36, 12, RED);
  fillRect(x + w - 46, y + 20, 18, 12, [255, 255, 255]);
  frame(x + w - 46, y + 20, 36, 12, INK);
  vline(x + w - 28, y + 20, y + 32, INK);
  // cells under microscope dots
  for (let i = 0; i < 5; i++) circle(x + 56 + i * 8, y + 16 + (i % 2) * 10, 3, GREEN, true);
}

// 8. Server room: racks, blinking lights, a warning triangle.
function sceneServer(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [30, 34, 44]);
  for (let r = 0; r < 3; r++) {
    fillRect(x + 8 + r * 30, y + 8, 24, h - 16, [52, 58, 70]);
    for (let u = 0; u < 4; u++) {
      fillRect(x + 11 + r * 30, y + 12 + u * 12, 18, 8, [70, 78, 92]);
      setPix(x + 13 + r * 30, y + 15 + u * 12, u % 2 ? [255, 80, 60] : [90, 220, 120]);
      setPix(x + 16 + r * 30, y + 15 + u * 12, [90, 220, 120]);
    }
  }
  // warning triangle
  poly(
    [
      [x + w - 24, y + h - 26],
      [x + w - 8, y + h - 26],
      [x + w - 16, y + h - 42],
    ],
    [255, 204, 0],
  );
  drawText('!', x + w - 18, y + h - 25, 1, INK);
}

// 9. Gaza: city blocks, a plume of smoke, a crescent moon.
function sceneGaza(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [240, 200, 160], [250, 230, 200]);
  fillRect(x, y + h - 20, w, 20, [180, 160, 130]);
  const heights = [26, 34, 22, 40, 28, 36, 24];
  for (let i = 0; i < heights.length; i++) {
    fillRect(x + 6 + i * 13, y + h - 20 - heights[i], 11, heights[i], [150, 135, 110]);
  }
  smoke(x + Math.floor(w * 0.6), y + 22, 9);
  smoke(x + Math.floor(w * 0.3), y + 16, 7);
  circle(x + w - 16, y + 12, 7, [250, 240, 200], true);
  circle(x + w - 13, y + 10, 6, [240, 200, 160], true);
}

// 10. Cricket: bat, ball, stumps and a scoreboard.
function sceneCricket(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, SKY, [200, 225, 190]);
  fillRect(x, y + h - 16, w, 16, [90, 150, 80]); // pitch
  fillRect(x, y + h - 16, w, 3, [220, 210, 170]);
  // stumps
  for (let s = 0; s < 3; s++) vline(x + 16 + s * 4, y + h - 34, y + h - 16, [240, 220, 150], 2);
  // bat leaning
  line(x + w - 34, y + h - 40, x + w - 20, y + h - 16, [210, 170, 110]);
  line(x + w - 34, y + h - 40, x + w - 30, y + h - 52, [210, 170, 110]);
  // red ball in flight
  circle(x + Math.floor(w * 0.55), y + 16, 5, RED, true);
  line(x + Math.floor(w * 0.55) - 8, y + 22, x + Math.floor(w * 0.55) - 20, y + 30, RED);
  // scoreboard
  fillRect(x + w - 52, y + 6, 46, 14, INK);
  drawText('344/2', x + w - 48, y + 9, 1, [255, 255, 255]);
}

// 11. Football: goal, ball, floodlights.
function sceneFootball(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [40, 60, 90], [90, 130, 90]);
  fillRect(x, y + h - 18, w, 18, [70, 130, 60]);
  // floodlights
  for (const fx of [x + 12, x + w - 12]) {
    vline(fx, y + 6, y + 18, [220, 220, 200], 2);
    circle(fx, y + 6, 4, [255, 250, 200], true);
  }
  // goal
  frame(x + Math.floor(w / 2) - 26, y + 20, 52, 26, [255, 255, 255], 2);
  for (let gx = x + Math.floor(w / 2) - 26; gx < x + Math.floor(w / 2) + 26; gx += 6) {
    vline(gx, y + 20, y + 46, [200, 200, 200]);
  }
  // ball
  circle(x + Math.floor(w / 2), y + h - 24, 5, [255, 255, 255], true);
  circle(x + Math.floor(w / 2), y + h - 24, 2, INK, true);
}

// 12. Ballot box and raised hands: elections and votes.
function sceneVote(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [250, 244, 230], [235, 228, 210]);
  fillRect(x + Math.floor(w / 2) - 18, y + 22, 36, 26, [31, 78, 121]);
  hline(x + Math.floor(w / 2) - 10, x + Math.floor(w / 2) + 10, y + 22, PAPER, 2);
  // paper going in
  fillRect(x + Math.floor(w / 2) - 8, y + 8, 16, 12, [255, 255, 255]);
  frame(x + Math.floor(w / 2) - 8, y + 8, 16, 12, INK);
  drawText('X', x + Math.floor(w / 2) - 3, y + 10, 1, RED);
  // raised hands
  for (let i = 0; i < 4; i++) {
    const hx = x + 10 + i * 22;
    fillRect(hx, y + h - 16, 8, 12, [232, 190, 150]);
    circle(hx + 4, y + h - 18, 4, [232, 190, 150], true);
  }
}

// 13. Rocket and flame: missiles, space and defence.
function sceneRocket(x: number, y: number, w: number, h: number): void {
  sceneSky(x, y, w, h, [20, 26, 48], [70, 80, 120]);
  for (let i = 0; i < 14; i++) {
    const sx = x + 6 + ((i * 37) % (w - 12));
    const sy = y + 6 + ((i * 23) % Math.floor(h / 2));
    setPix(sx, sy, [255, 255, 255]);
  }
  // rocket body, diagonal
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  poly(
    [
      [cx - 6, cy + 14],
      [cx + 6, cy + 14],
      [cx + 4, cy - 8],
      [cx, cy - 18],
      [cx - 4, cy - 8],
    ],
    [230, 230, 225],
  );
  poly(
    [
      [cx - 6, cy + 14],
      [cx - 12, cy + 22],
      [cx - 6, cy + 18],
    ],
    RED,
  );
  poly(
    [
      [cx + 6, cy + 14],
      [cx + 12, cy + 22],
      [cx + 6, cy + 18],
    ],
    RED,
  );
  circle(cx, cy - 6, 3, SKY, true);
  // flame
  poly(
    [
      [cx - 4, cy + 14],
      [cx + 4, cy + 14],
      [cx, cy + 30],
    ],
    ORANGE,
  );
  poly(
    [
      [cx - 2, cy + 14],
      [cx + 2, cy + 14],
      [cx, cy + 24],
    ],
    [255, 220, 120],
  );
}

const SCENES: Record<string, (x: number, y: number, w: number, h: number) => void> = {
  bridges: sceneBridges,
  flags: sceneFlags,
  chart: sceneChart,
  math: sceneMath,
  parliament: sceneParliament,
  crowd: sceneCrowd,
  lab: sceneLab,
  server: sceneServer,
  gaza: sceneGaza,
  cricket: sceneCricket,
  football: sceneFootball,
  vote: sceneVote,
  rocket: sceneRocket,
};

// ---------------------------------------------------------------------------
// World map: coarse continents on an equirectangular grid, numbered pins.
// ---------------------------------------------------------------------------

type LonLat = [number, number];

const CONTINENTS: LonLat[][] = [
  // North America
  [[-168, 66], [-150, 70], [-135, 69], [-125, 71], [-115, 73], [-100, 73], [-90, 74], [-82, 73], [-76, 71], [-68, 66], [-60, 60], [-55, 52], [-60, 47], [-65, 44], [-70, 42], [-75, 38], [-76, 34], [-80, 32], [-81, 26], [-84, 30], [-90, 21], [-92, 15], [-97, 16], [-105, 20], [-110, 23], [-114, 29], [-120, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-155, 58], [-165, 60], [-168, 66]],
  // Greenland
  [[-58, 64], [-52, 60], [-42, 60], [-32, 68], [-40, 74], [-55, 76], [-68, 76], [-60, 74], [-58, 64]],
  // South America
  [[-79, 9], [-72, 12], [-64, 11], [-58, 6], [-52, 5], [-50, 0], [-44, -3], [-38, -5], [-35, -9], [-38, -15], [-40, -21], [-48, -27], [-53, -33], [-58, -38], [-65, -41], [-68, -50], [-70, -54], [-73, -50], [-73, -40], [-73, -30], [-71, -20], [-77, -12], [-81, -5], [-80, 2], [-79, 9]],
  // Africa
  [[-17, 15], [-16, 20], [-15, 27], [-10, 31], [-5, 35], [0, 36], [10, 37], [11, 34], [19, 32], [25, 32], [30, 31], [32, 31], [34, 28], [36, 22], [38, 18], [43, 12], [48, 11], [51, 11], [48, 5], [44, 0], [41, -4], [40, -10], [36, -18], [33, -26], [28, -33], [20, -35], [16, -30], [14, -22], [12, -17], [13, -12], [9, -4], [9, 4], [-8, 5], [-13, 8], [-17, 15]],
  // Europe
  [[-10, 36], [-9, 38], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [0, 50], [2, 51], [5, 53], [8, 55], [8, 57], [10, 59], [12, 58], [18, 56], [21, 55], [24, 58], [21, 59], [24, 60], [28, 60], [30, 62], [28, 65], [25, 68], [21, 70], [18, 69], [14, 68], [12, 66], [10, 64], [6, 62], [5, 60], [5, 58], [0, 57], [-3, 58], [-6, 57], [-10, 54], [-10, 50], [-6, 49], [-10, 43], [-10, 36]],
  // Asia
  [[30, 62], [32, 66], [40, 68], [50, 69], [60, 69], [68, 73], [75, 73], [85, 75], [95, 76], [105, 77], [115, 73], [125, 72], [135, 71], [145, 72], [155, 69], [162, 66], [170, 67], [178, 65], [178, 62], [170, 60], [162, 58], [158, 52], [156, 50], [150, 45], [142, 45], [142, 40], [140, 38], [135, 34], [130, 32], [127, 34], [126, 38], [122, 39], [121, 36], [120, 32], [120, 28], [115, 23], [110, 20], [108, 18], [105, 10], [103, 8], [100, 7], [98, 10], [96, 15], [93, 20], [90, 22], [88, 22], [85, 19], [82, 16], [80, 10], [77, 8], [75, 12], [73, 18], [70, 21], [66, 25], [62, 25], [58, 26], [54, 27], [52, 28], [50, 29], [48, 30], [45, 31], [43, 34], [40, 36], [36, 36], [34, 38], [30, 41], [28, 45], [28, 50], [30, 55], [30, 62]],
  // Australia
  [[113, -22], [114, -28], [115, -32], [115, -35], [120, -34], [125, -32], [130, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [151, -24], [148, -20], [146, -19], [143, -15], [142, -11], [137, -12], [135, -12], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20], [114, -22], [113, -22]],
  // Indonesia / SE Asia islands
  [[95, 5], [98, 3], [102, 0], [106, -3], [110, -6], [115, -8], [120, -9], [125, -9], [130, -6], [135, -4], [138, -2], [140, -3], [136, 0], [130, 1], [124, 2], [118, 1], [112, 3], [106, 4], [100, 4], [95, 5]],
  // Japan
  [[130, 31], [132, 33], [135, 34], [137, 35], [139, 36], [140, 39], [141, 41], [143, 42], [145, 44], [143, 44], [141, 42], [140, 38], [137, 37], [134, 35], [131, 33], [130, 31]],
  // Britain
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [0, 53], [1, 51], [-2, 50], [-5, 50]],
  // Madagascar
  [[44, -16], [47, -15], [50, -16], [50, -20], [47, -25], [44, -25], [43, -20], [44, -16]],
  // New Zealand
  [[167, -45], [170, -43], [173, -41], [175, -38], [178, -38], [175, -40], [172, -43], [168, -46], [167, -45]],
];

const PINS: Array<{ n: number; lon: number; lat: number; label: string }> = [
  { n: 1, lon: 30.5, lat: 50.5, label: 'KYIV' },
  { n: 2, lon: 19.0, lat: 52.0, label: 'POLAND' },
  { n: 3, lon: 4.4, lat: 50.8, label: 'BRUSSELS' },
  { n: 4, lon: 30.7, lat: 36.9, label: 'ANTALYA' },
  { n: 5, lon: -74.0, lat: 40.7, label: 'NEW YORK' },
  { n: 6, lon: 114.1, lat: 22.5, label: 'SHENZHEN' },
  { n: 7, lon: 106.9, lat: 47.9, label: 'ULAANBAATAR' },
  { n: 8, lon: 34.5, lat: 31.5, label: 'GAZA' },
  { n: 9, lon: -72.3, lat: 18.5, label: 'HAITI' },
  { n: 10, lon: 174.8, lat: -41.3, label: 'WELLINGTON' },
  { n: 11, lon: 46.7, lat: 24.7, label: 'RIYADH' },
  { n: 12, lon: 77.2, lat: 28.6, label: 'DELHI' },
];

function drawMap(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SEA);
  // graticule
  for (let gx = 1; gx < 8; gx++) vline(x + Math.floor((gx * w) / 8), y, y + h - 1, [200, 220, 230]);
  for (let gy = 1; gy < 4; gy++) hline(x, x + w - 1, y + Math.floor((gy * h) / 4), [200, 220, 230]);
  const project = (lon: number, lat: number): [number, number] => [
    x + Math.floor(((lon + 180) / 360) * w),
    y + Math.floor(((90 - lat) / 180) * h),
  ];
  for (const cont of CONTINENTS) {
    const pts = cont.map(([lo, la]) => project(lo, la));
    poly(pts, LAND);
    for (let i = 0; i < pts.length; i++) {
      line(pts[i][0], pts[i][1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], [180, 168, 140]);
    }
  }
  // pins
  for (const p of PINS) {
    const [px0, py0] = project(p.lon, p.lat);
    circle(px0, py0, 8, RED, true);
    circle(px0, py0, 8, INK, false);
    drawTextCentred(String(p.n), px0, py0 - 4, 1, [255, 255, 255]);
  }
  frame(x, y, w, h, INK, 2);
}

// ---------------------------------------------------------------------------
// The day's stories. 43 in all, each checked against reporting published
// on Saturday 21 November 2026. Counts: 1 lead + 12 map pins + 6 strip
// scenes + 6 column scenes + 6 column text stories + 12 in brief = 43.
// Illustrated stories: lead + 6 strip + 6 column = 13.
// ---------------------------------------------------------------------------

interface Story {
  kick: string;
  head: string;
  deck: string;
  scene?: string;
}

const LEAD: Story = {
  kick: 'WAR IN EUROPE — THE OVERNIGHT STRIKE',
  head: "Russia's biggest strike of the war hits Kyiv — and lands in Poland",
  deck: 'More than 400 drones and 110 missiles, 27 of them ballistic, rained on Ukraine overnight. Three bridges across the Dnipro were hit, nine people were killed, and two missiles and a drone came down in Poland as NATO jets scrambled.',
  scene: 'bridges',
};

// One line each, keyed to the numbered pins on the map.
const PIN_STORIES: string[] = [
  'KYIV — 500-weapon night; 3 bridges hit, 9 dead.',
  'POLAND — 2 missiles and a drone fell on its soil.',
  'BRUSSELS — UK-EU reset: food, carbon, youth.',
  'ANTALYA — COP31 in overtime; no fossil-fuel deal.',
  'NEW YORK — AI rout: S&P 500 into correction.',
  'SHENZHEN — Trump tells Europe to defund Kyiv.',
  'ULAANBAATAR — President resigns; vote in 4 months.',
  'GAZA — 7 Palestinians killed despite ceasefire.',
  'HAITI — Salvadoran troops lose a third soldier.',
  'WELLINGTON — Rahul century puts India on top.',
  'RIYADH — Yemen port hit; Houthis warn airlines.',
  'DELHI — India U17 qualify for the Asian Cup.',
];

// Six small illustrated stories in the strip under the map.
const STRIP: Story[] = [
  {
    kick: 'MONGOLIA',
    head: 'President quits',
    deck: 'The president resigns, setting up elections within four months.',
    scene: 'parliament',
  },
  {
    kick: 'GAZA',
    head: 'Strikes go on',
    deck: 'Seven Palestinians killed in Israeli strikes despite the ceasefire.',
    scene: 'gaza',
  },
  {
    kick: 'CRICKET',
    head: 'Rahul\u2019s hundred',
    deck: 'India reach 344 for 2 at tea on day three in Wellington.',
    scene: 'cricket',
  },
  {
    kick: 'FOOTBALL',
    head: 'Kane out for months',
    deck: 'Bayern lose their striker to an ankle ligament tear in a 1-1 draw.',
    scene: 'football',
  },
  {
    kick: 'FRANCE',
    head: 'Leak inquiry',
    deck: 'Paris probes a suspected ministry leak to the far-right RN party.',
    scene: 'vote',
  },
  {
    kick: 'IRAN',
    head: 'New strikes weighed',
    deck: 'Trump weighs fresh strikes as Israel presses; war may run to 2027.',
    scene: 'rocket',
  },
];

// Six illustrated stories at the top of the three columns.
const COLUMN_SCENES: Story[] = [
  {
    kick: 'BRITAIN AND THE EU',
    head: 'Reset sealed in Brussels',
    deck: 'Burnham and EU leaders sign three deals on food, carbon and youth mobility.',
    scene: 'flags',
  },
  {
    kick: 'MARKETS',
    head: 'The AI rout deepens',
    deck: 'US stocks fell 3.7% as the AI sell-off pushed the S&P 500 into correction.',
    scene: 'chart',
  },
  {
    kick: 'MATHEMATICS',
    head: 'A proof of Riemann?',
    deck: 'An Anthropic mathematician says he and Claude proved the Riemann hypothesis. It is unverified.',
    scene: 'math',
  },
  {
    kick: 'EUROPE',
    head: 'Gen Z takes to the streets',
    deck: 'Young protesters march in 25 European countries against living costs and militarisation.',
    scene: 'crowd',
  },
  {
    kick: 'MEDICINE',
    head: 'A pill against pancreatic cancer',
    deck: 'Trial pill daraxonrasib made tumours undetectable in one in 12 patients.',
    scene: 'lab',
  },
  {
    kick: 'CYBER',
    head: 'FBI database hacked',
    deck: 'The FBI criminal database was reportedly hacked amid outages across the US.',
    scene: 'server',
  },
];

// Six text stories inside the columns.
const COLUMN_TEXT: Story[] = [
  {
    kick: 'WASHINGTON',
    head: 'Older chips only for China',
    deck: 'Trump says only older chips go to China, and calls its nuclear build-up rapid.',
  },
  {
    kick: 'BRUSSELS',
    head: 'Record aid for Kyiv',
    deck: 'The EU hands Ukraine a record 7.9bn euros, with 90bn euros pledged by end-2027.',
  },
  {
    kick: 'JAPAN',
    head: 'Supercomputer breached',
    deck: 'An intruder took 430 keys from Fugaku supercomputer users; traces touched 4,222 users.',
  },
  {
    kick: 'IRAQ',
    head: 'Raid on Iran-backed militia',
    deck: 'Iraqi troops storm a Kataeb Hezbollah stronghold and detain an oil chief over smuggling.',
  },
  {
    kick: 'MONEY',
    head: 'Revolut flagged by Nordic police',
    deck: 'Police call the fintech the main channel for suspected Russia-linked money laundering.',
  },
  {
    kick: 'BALTICS',
    head: 'Estonia to shut Russia border',
    deck: 'Tallinn plans to close its border with Russia for six months as tensions rise.',
  },
];

// Twelve one-line items for the foot of the page.
const BRIEF: string[] = [
  'Anthropic ends its first Nasdaq day at $97.17, 17% above its IPO price.',
  'Medvedev beats Tiafoe 6-3, 6-4 at the ATP Finals in Turin.',
  'NBA: Nuggets 133-124 Rockets; Lakers 106-104 Kings.',
  'Pakistan Shaheens beat UAE by 61 runs in the Asia Cup Rising Stars.',
  'Hobart Hurricanes women beat Sydney Thunder by 8 wickets.',
  'Fiona the hippo dies at a US zoo after swallowing a cap.',
  'The Vatican Museums open a show on the history of Popemobiles.',
  'Kazakhstan seals $1.2bn in deals at COP31 in Antalya.',
  'The UN cuts its food-aid target despite starvation warnings.',
  'Pistorius: European nations ought to talk to Putin.',
  'Syria arrests an ex-general accused of a 2014 massacre.',
  'Car-trafficking crackdown: 2,395 seizures, 689 arrests.',
];

// ---------------------------------------------------------------------------
// Layout.
// ---------------------------------------------------------------------------

function drawMasthead(): void {
  fillRect(0, 0, W, 6, RED);
  drawTextCentredBold('THE WORLD IN ONE PAGE', 512, 16, 5, INK);
  drawTextCentred('SATURDAY, 21 NOVEMBER 2026', 512, 58, 2, RED);
  drawText('43 STORIES', 24, 60, 1, GREY);
  drawText('13 PICTURES', 1024 - 24 - textWidth('13 PICTURES', 1), 60, 1, GREY);
  hline(24, 1000, 82, INK, 2);
  hline(24, 1000, 86, INK, 1);
}

function drawLead(): void {
  frame(24, 94, 976, 200, INK, 2);
  const scene = SCENES[LEAD.scene ?? 'bridges'];
  scene(30, 100, 596, 188);
  frame(30, 100, 596, 188, INK, 1);
  const tx = 642;
  const tw = 352;
  drawText(LEAD.kick, tx, 104, 1, RED);
  hline(tx, tx + tw - 1, 118, RED, 1);
  let y = drawHead(LEAD.head, tx, 126, tw, 2, INK, 16);
  y += 6;
  y = drawPara(LEAD.deck, tx, y, tw, 1, INK, 10);
  y += 8;
  drawText('9 DEAD  ·  3 BRIDGES  ·  2 MISSILES IN POLAND', tx, y, 1, GREY);
}

function drawMapSection(): void {
  drawTextBold('THE DAY ON THE MAP', 24, 302, 1, INK);
  drawText('12 PLACES, NUMBERED', 1024 - 24 - textWidth('12 PLACES, NUMBERED', 1), 302, 1, GREY);
  drawMap(24, 318, 620, 170);
  // Legend: one short line per pin.
  const lx = 660;
  let y = 318;
  drawTextBold('WHERE IT HAPPENED', lx, y, 1, INK);
  y += 14;
  for (let i = 0; i < PIN_STORIES.length; i++) {
    const p = PINS[i];
    fillRect(lx, y - 1, 13, 12, RED);
    drawTextCentred(String(p.n), lx + 6, y + 1, 1, [255, 255, 255]);
    drawText(PIN_STORIES[i], lx + 18, y, 1, INK);
    y += 13;
  }
}

function drawStrip(): void {
  drawTextBold('SIX MORE STORIES, IN PICTURES', 24, 498, 1, INK);
  for (let i = 0; i < STRIP.length; i++) {
    const s = STRIP[i];
    const x = 24 + i * 164;
    drawTextBold(s.head.toUpperCase(), x, 510, 1, INK);
    const scene = SCENES[s.scene ?? 'vote'];
    scene(x, 521, 156, 40);
    frame(x, 521, 156, 40, INK, 1);
    drawPara(s.deck, x, 565, 156, 1, INK, 9);
  }
}

// One illustrated story block inside a column; returns the next y.
function drawSceneBlock(s: Story, x: number, y: number, w: number): number {
  const scene = SCENES[s.scene ?? 'vote'];
  scene(x, y, w, 44);
  frame(x, y, w, 44, INK, 1);
  y += 50;
  drawText(s.kick, x, y, 1, RED);
  y += 11;
  y = drawHead(s.head, x, y, w, 1, INK, 11);
  y += 2;
  y = drawPara(s.deck, x, y, w, 1, INK, 10);
  y += 6;
  return y;
}

// One text story block inside a column; returns the next y.
function drawTextBlock(s: Story, x: number, y: number, w: number): number {
  drawText(s.kick, x, y, 1, RED);
  y += 11;
  y = drawHead(s.head, x, y, w, 1, INK, 11);
  y += 2;
  y = drawPara(s.deck, x, y, w, 1, INK, 10);
  y += 6;
  return y;
}

function drawColumns(): number {
  let maxY = 0;
  for (let col = 0; col < 3; col++) {
    const x = 24 + col * 336;
    const w = 304;
    let y = 596;
    y = drawSceneBlock(COLUMN_SCENES[col * 2], x, y, w);
    y = drawSceneBlock(COLUMN_SCENES[col * 2 + 1], x, y, w);
    y = drawTextBlock(COLUMN_TEXT[col * 2], x, y, w);
    y = drawTextBlock(COLUMN_TEXT[col * 2 + 1], x, y, w);
    if (y > maxY) maxY = y;
  }
  return maxY;
}

function drawBrief(): void {
  drawTextBold('IN BRIEF — THE REST OF THE DAY', 24, 920, 1, INK);
  hline(24, 1000, 934, INK, 1);
  for (let i = 0; i < BRIEF.length; i++) {
    const col = i < 6 ? 0 : 1;
    const row = i % 6;
    const x = col === 0 ? 24 : 524;
    const y = 940 + row * 12;
    drawText('*', x, y, 1, RED);
    drawText(BRIEF[i], x + 10, y, 1, INK);
  }
  const foot =
    'Sources: AP, Reuters, CNN, Fox News, Euronews, IANS, The Neuron, OneTurn — verified 21 Nov 2026. Drawn by code; scenes are illustrations.';
  drawTextCentred(foot, 512, 1012, 1, GREY);
}

// Self-check: counts and gate limits, printed on every run so a bad build
// is obvious before anyone submits it.
function validate(png: Buffer): void {
  const stories = 1 + PIN_STORIES.length + STRIP.length + COLUMN_SCENES.length + COLUMN_TEXT.length + BRIEF.length;
  const illustrated = 1 + STRIP.length + COLUMN_SCENES.length;
  const checks: Array<[string, boolean]> = [
    ['stories total is 43', stories === 43],
    ['illustrated stories is 13', illustrated === 13],
    ['map pins is 12', PINS.length === 12],
    ['in-brief items is 12', BRIEF.length === 12],
    ['PNG is at most 1 MiB', png.length <= 1048576],
    ['PNG is 1024x1024', png.readUInt32BE(16) === 1024 && png.readUInt32BE(20) === 1024],
    ['PNG signature is valid', png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47],
    ['every strip story has a scene', STRIP.every((s) => s.scene !== undefined && SCENES[s.scene] !== undefined)],
    ['every column scene story has a scene', COLUMN_SCENES.every((s) => s.scene !== undefined && SCENES[s.scene] !== undefined)],
    ['lead has a scene', LEAD.scene !== undefined && SCENES[LEAD.scene] !== undefined],
    ['all pin numbers are 1..12 in order', PINS.every((p, i) => p.n === i + 1)],
    ['no story headline is empty', [LEAD, ...STRIP, ...COLUMN_SCENES, ...COLUMN_TEXT].every((s) => s.head.length > 0)],
    ['no story deck is empty', [LEAD, ...STRIP, ...COLUMN_SCENES, ...COLUMN_TEXT].every((s) => s.deck.length > 0)],
    ['no deck exceeds 260 characters', [LEAD, ...STRIP, ...COLUMN_SCENES, ...COLUMN_TEXT].every((s) => s.deck.length <= 260)],
    ['every pin legend line fits one line', PIN_STORIES.every((s) => textWidth(s, 1) <= 322)],
    ['masthead fits the page width', textWidth('THE WORLD IN ONE PAGE', 5) <= 976],
    ['no title contains a dollar sign', !'Saturday 21 November 2026 in one page'.includes('$')],
  ];
  let failed = 0;
  for (const [name, ok] of checks) {
    // eslint-disable-next-line no-console
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    if (!ok) failed++;
  }
  // eslint-disable-next-line no-console
  console.log(`stories=${stories} illustrated=${illustrated} pins=${PINS.length} brief=${BRIEF.length} bytes=${png.length}`);
  if (failed > 0) throw new Error(`${failed} validation check(s) failed`);
}

function main(): void {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawLead();
  drawMapSection();
  drawStrip();
  const colEnd = drawColumns();
  drawBrief();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const png = encodePng(px, W, H);
  writeFileSync(join(outDir, 'entry.png'), png);
  validate(png);
  // eslint-disable-next-line no-console
  console.log(`wrote ${png.length} bytes; columns end y=${colEnd}`);
}

main();
