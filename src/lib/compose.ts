import "server-only";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { canvas, drawText } from "./png";

type Frame = { width: number; height: number; data: Uint8Array };

function decode(bytes: Buffer, mime: string): Frame {
  if (mime.includes("png") || bytes[0] === 137) {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: png.data };
  }
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function blit(board: ReturnType<typeof canvas>, frame: Frame, dx: number, dy: number, dw: number, dh: number) {
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(frame.height - 1, Math.floor((y / dh) * frame.height));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(frame.width - 1, Math.floor((x / dw) * frame.width));
      const i = (sy * frame.width + sx) * 4;
      const di = ((dy + y) * board.width + (dx + x)) * 4;
      board.data[di] = frame.data[i];
      board.data[di + 1] = frame.data[i + 1];
      board.data[di + 2] = frame.data[i + 2];
      board.data[di + 3] = 255;
    }
  }
}

export function composeBeforeAfter(beforeBytes: Buffer, beforeMime: string, afterBytes: Buffer, afterMime: string, labels: [string, string]) {
  const before = decode(beforeBytes, beforeMime);
  const after = decode(afterBytes, afterMime);
  const height = 420;
  const beforeWidth = Math.max(1, Math.round((before.width / before.height) * height));
  const afterWidth = Math.max(1, Math.round((after.width / after.height) * height));
  const gap = 12;
  const board = canvas(beforeWidth + afterWidth + gap, height + 56);
  board.fill([18, 26, 36]);
  blit(board, before, 0, 0, beforeWidth, height);
  blit(board, after, beforeWidth + gap, 0, afterWidth, height);
  board.rect(0, height, board.width, 56, [18, 26, 36]);
  drawText(board, labels[0], 12, height + 16, 3, [255, 255, 255]);
  drawText(board, labels[1], beforeWidth + gap + 12, height + 16, 3, [255, 255, 255]);
  return board.encode();
}
