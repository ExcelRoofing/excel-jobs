import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function saveStream(stream: AsyncIterable<unknown>, dest: string, maxBytes: number): Promise<{ hash: string; bytes: number }> {
  await ensureDir(path.dirname(dest));
  const hash = createHash("sha256");
  let bytes = 0;
  const tap = new Transform({
    transform(chunk, _enc, callback) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      bytes += buf.length;
      if (bytes > maxBytes) {
        callback(new Error(`file is larger than ${maxBytes} bytes`));
        return;
      }
      hash.update(buf);
      callback(null, buf);
    },
  });
  try {
    await pipeline(stream as NodeJS.ReadableStream, tap, createWriteStream(dest));
  } catch (error) {
    await rm(dest, { force: true }).catch(() => undefined);
    throw error;
  }
  if (bytes === 0) {
    await rm(dest, { force: true }).catch(() => undefined);
    throw new Error("downloaded file was empty");
  }
  return { hash: hash.digest("hex"), bytes };
}

export async function writeBuffer(dest: string, bytes: Buffer): Promise<{ hash: string; bytes: number }> {
  await ensureDir(path.dirname(dest));
  await writeFile(dest, bytes);
  return { hash: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

export async function writeTextAtomic(dest: string, text: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  const tmp = `${dest}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, dest);
}

export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function readBuffer(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}
