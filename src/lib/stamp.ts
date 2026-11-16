import type { Locale } from "./types";
import { formatStamp } from "./time";

export async function stampPhoto(file: Blob, locale: Locale, geo: { lat: number; lng: number } | null) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const bar = Math.round(Math.min(120, Math.max(72, width * 0.075)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height + bar;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  ctx.fillStyle = "#121a24";
  ctx.fillRect(0, height, width, bar);
  ctx.fillStyle = "#d4652f";
  ctx.fillRect(0, height, width, Math.max(3, Math.round(bar * 0.06)));
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(bar * 0.28)}px "Atkinson Hyperlegible", sans-serif`;
  const where = geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "GPS off";
  ctx.fillText(`Excel Jobs   ${formatStamp(new Date(), locale)}`, 16, height + bar * 0.46);
  ctx.font = `400 ${Math.round(bar * 0.22)}px "Atkinson Hyperlegible", sans-serif`;
  ctx.fillStyle = "#f4d6c4";
  ctx.fillText(where, 16, height + bar * 0.8);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("stamp"))), "image/jpeg", 0.84);
  });
  bitmap.close();
  return blob;
}
