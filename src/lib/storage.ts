import "server-only";
import fs from "fs";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { blobDir, libraryDir } from "./db";

export type StorageState = "local" | "s3" | "s3-misconfigured";

export function storageState(): StorageState {
  if (process.env.STORAGE !== "s3") return "local";
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) return "s3";
  return "s3-misconfigured";
}

function s3() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
}

function useS3() {
  return storageState() === "s3";
}

export async function putBlob(key: string, bytes: Buffer, mime: string) {
  if (useS3()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `blobs/${key}`,
        Body: bytes,
        ContentType: mime,
      }),
    );
    return;
  }
  fs.writeFileSync(path.join(blobDir(), key), bytes);
}

export async function getBlob(key: string) {
  if (useS3()) {
    const result = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `blobs/${key}` }));
    if (!result.Body) throw new Error("missing blob");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  const file = path.join(blobDir(), key);
  if (!file.startsWith(blobDir())) throw new Error("bad key");
  return fs.readFileSync(file);
}

export async function deleteBlob(key: string) {
  if (useS3()) {
    await s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `blobs/${key}` })).catch(() => undefined);
    return;
  }
  const file = path.join(blobDir(), key);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function writeLibrary(relativePath: string, bytes: Buffer) {
  const full = safeLibraryPath(relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
}

export function removeLibrary(relativePath: string | null) {
  if (!relativePath) return;
  const full = safeLibraryPath(relativePath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

export function safeLibraryPath(relativePath: string) {
  const parts = relativePath.split("/").filter((part) => part && part !== "." && part !== "..");
  const full = path.resolve(libraryDir(), ...parts);
  const root = path.resolve(libraryDir());
  if (!full.startsWith(root)) throw new Error("bad library path");
  return full;
}
