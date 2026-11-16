import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { renderMark } from "./png";
import { COMPANY } from "./constants";

function win(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x09\x0a\x0d\x20-\xff]/g, "");
}

export async function buildPhotoReport(input: {
  title: string;
  jobName: string;
  address: string;
  customer: string;
  lines: { bytes: Buffer; mime: string; caption: string; meta: string }[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(renderMark(128));
  const cover = pdf.addPage([612, 792]);
  cover.drawRectangle({ x: 0, y: 640, width: 612, height: 152, color: rgb(0.07, 0.1, 0.14) });
  cover.drawImage(logo, { x: 48, y: 676, width: 72, height: 72 });
  cover.drawText(win(COMPANY.name), { x: 136, y: 720, size: 18, font: bold, color: rgb(1, 1, 1) });
  cover.drawText("Excel Jobs", { x: 136, y: 696, size: 12, font, color: rgb(0.96, 0.84, 0.77) });
  cover.drawText(win(input.title), { x: 48, y: 560, size: 28, font: bold, color: rgb(0.1, 0.14, 0.18) });
  cover.drawText(win(input.jobName), { x: 48, y: 520, size: 16, font, color: rgb(0.2, 0.25, 0.3) });
  cover.drawText(win(input.customer), { x: 48, y: 496, size: 14, font, color: rgb(0.2, 0.25, 0.3) });
  cover.drawText(win(input.address), { x: 48, y: 474, size: 14, font, color: rgb(0.2, 0.25, 0.3) });
  cover.drawText(win(`${COMPANY.address}  ·  ${COMPANY.phoneDisplay}`), { x: 48, y: 48, size: 10, font, color: rgb(0.35, 0.4, 0.45) });

  for (let index = 0; index < input.lines.length; index += 2) {
    const page = pdf.addPage([612, 792]);
    page.drawText(win(input.jobName), { x: 48, y: 760, size: 11, font: bold, color: rgb(0.1, 0.14, 0.18) });
    const pair = input.lines.slice(index, index + 2);
    for (let slot = 0; slot < pair.length; slot++) {
      const item = pair[slot];
      const top = slot === 0 ? 430 : 80;
      try {
        const image = item.mime.includes("png") ? await pdf.embedPng(item.bytes) : await pdf.embedJpg(item.bytes);
        const scale = Math.min(240 / image.width, 240 / image.height, 1);
        page.drawImage(image, { x: 48, y: top, width: image.width * scale, height: image.height * scale });
      } catch {
        page.drawText("(photo)", { x: 48, y: top + 100, size: 12, font });
      }
      page.drawText(win(item.caption).slice(0, 90) || " ", { x: 310, y: top + 180, size: 12, font: bold, color: rgb(0.1, 0.14, 0.18) });
      page.drawText(win(item.meta).slice(0, 90), { x: 310, y: top + 158, size: 10, font, color: rgb(0.35, 0.4, 0.45) });
    }
    page.drawText(win(COMPANY.name), { x: 48, y: 36, size: 9, font, color: rgb(0.4, 0.45, 0.5) });
  }
  return Buffer.from(await pdf.save());
}
