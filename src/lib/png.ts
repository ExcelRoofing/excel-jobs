import { deflateSync } from "zlib";

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC = crcTable();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(width: number, height: number, rgba: Uint8Array) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4);
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

type RGB = [number, number, number, number?];

export function canvas(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  const set = (x: number, y: number, c: RGB) => {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return;
    const i = (yi * width + xi) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = c[3] ?? 255;
  };
  return {
    data,
    width,
    height,
    fill(c: RGB) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, c);
    },
    rect(x: number, y: number, w: number, h: number, c: RGB) {
      const x0 = Math.max(0, x | 0);
      const y0 = Math.max(0, y | 0);
      const x1 = Math.min(width, (x + w) | 0);
      const y1 = Math.min(height, (y + h) | 0);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) set(xx, yy, c);
    },
    tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB) {
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let y = minY; y <= maxY; y++) {
        const xs: number[] = [];
        const edges: [number, number, number, number][] = [
          [x0, y0, x1, y1],
          [x1, y1, x2, y2],
          [x2, y2, x0, y0],
        ];
        for (const [ax, ay, bx, by] of edges) {
          if ((ay <= y && by > y) || (by <= y && ay > y)) {
            const t = (y - ay) / (by - ay);
            xs.push(ax + t * (bx - ax));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        const left = Math.max(0, Math.floor(xs[0]));
        const right = Math.min(width - 1, Math.ceil(xs[xs.length - 1]));
        for (let x = left; x <= right; x++) set(x, y, c);
      }
    },
    shadeSky(top: RGB, bottom: RGB) {
      for (let y = 0; y < height; y++) {
        const t = y / height;
        const c: RGB = [
          top[0] + (bottom[0] - top[0]) * t,
          top[1] + (bottom[1] - top[1]) * t,
          top[2] + (bottom[2] - top[2]) * t,
        ];
        for (let x = 0; x < width; x++) set(x, y, c);
      }
    },
    encode() {
      return encodePNG(width, height, data);
    },
  };
}

const FONT: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
};

export function drawText(
  board: ReturnType<typeof canvas>,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: RGB,
) {
  let cursor = x;
  const upper = text.toUpperCase();
  for (const ch of upper) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") {
          board.rect(cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += 6 * scale;
  }
  return cursor;
}

export function renderMark(size: number) {
  const board = canvas(size, size);
  board.fill([18, 26, 36]);
  const pad = size * 0.16;
  board.tri(pad, size * 0.46, size / 2, size * 0.18, size - pad, size * 0.46, [212, 101, 47]);
  board.rect(size * 0.28, size * 0.46, size * 0.44, size * 0.34, [244, 239, 231]);
  board.rect(size * 0.44, size * 0.58, size * 0.12, size * 0.22, [212, 101, 47]);
  return board.encode();
}

export type SceneKind = "before" | "during" | "after" | "damage" | "skylight" | "solar" | "flashing" | "safety";

export function renderScene(kind: SceneKind, stamp: string[]) {
  const w = 880;
  const h = 620;
  const board = canvas(w, h);
  const sky: Record<SceneKind, [RGB, RGB]> = {
    before: [[176, 196, 214], [214, 220, 216]],
    during: [[168, 188, 210], [196, 176, 150]],
    after: [[92, 168, 214], [186, 220, 236]],
    damage: [[120, 132, 146], [186, 176, 166]],
    skylight: [[110, 176, 214], [210, 228, 238]],
    solar: [[70, 140, 196], [250, 214, 140]],
    flashing: [[150, 170, 188], [210, 206, 196]],
    safety: [[180, 196, 210], [230, 220, 190]],
  };
  board.shadeSky(sky[kind][0], sky[kind][1]);
  board.rect(0, 430, w, h - 430, [92, 122, 78]);
  board.rect(250, 300, 380, 180, [236, 228, 214]);
  board.rect(300, 360, 70, 120, [90, 110, 120]);
  board.rect(430, 350, 90, 70, [186, 214, 226]);
  const roof = kind === "during" ? [146, 112, 78] : kind === "after" ? [58, 64, 72] : [92, 96, 102];
  board.tri(210, 310, 440, 180, 680, 310, roof as RGB);
  if (kind === "during") {
    for (let i = 0; i < 6; i++) board.rect(280 + i * 55, 230, 8, 80, [92, 64, 40]);
  }
  if (kind === "damage") board.rect(360, 230, 70, 36, [48, 42, 40]);
  if (kind === "skylight") board.rect(400, 210, 70, 46, [214, 236, 246]);
  if (kind === "solar") {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) board.rect(360 + c * 48, 210 + r * 32, 40, 24, [28, 74, 130]);
  }
  if (kind === "flashing") board.rect(250, 300, 430, 10, [196, 200, 204]);
  if (kind === "safety") {
    board.rect(180, 390, 28, 70, [232, 120, 28]);
    board.tri(174, 390, 194, 360, 214, 390, [232, 120, 28]);
    board.rect(560, 250, 8, 180, [232, 168, 40]);
  }
  if (kind === "after") board.rect(300, 250, 280, 8, [36, 40, 46]);
  board.rect(0, h - 78, w, 78, [18, 26, 36]);
  board.rect(0, h - 78, w, 4, [212, 101, 47]);
  drawText(board, stamp[0] || "", 18, h - 58, 3, [255, 255, 255]);
  drawText(board, stamp[1] || "", 18, h - 30, 3, [244, 214, 196]);
  return board.encode();
}
