"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";

type Tool = "draw" | "arrow" | "text" | "measure";

export function MarkupPad({ jobId, fileId, src }: { jobId: string; fileId: string; src: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#d4652f");
  const [label, setLabel] = useState("12 ft");
  const [text, setText] = useState("");
  const drawing = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const snapshot = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1200 / image.width);
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = src;
  }, [src]);

  function point(event: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function down(event: React.PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    start.current = point(event);
    snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (tool === "text" && text) {
      ctx.fillStyle = color;
      ctx.font = "bold 36px sans-serif";
      ctx.fillText(text, start.current.x, start.current.y);
      drawing.current = false;
    }
  }

  function move(event: React.PointerEvent) {
    if (!drawing.current || !start.current || !snapshot.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const now = point(event);
    if (tool === "draw") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(start.current.x, start.current.y);
      ctx.lineTo(now.x, now.y);
      ctx.stroke();
      start.current = now;
      return;
    }
    ctx.putImageData(snapshot.current, 0, 0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 6;
    if (tool === "arrow" || tool === "measure") {
      ctx.beginPath();
      ctx.moveTo(start.current.x, start.current.y);
      ctx.lineTo(now.x, now.y);
      ctx.stroke();
      const angle = Math.atan2(now.y - start.current.y, now.x - start.current.x);
      ctx.beginPath();
      ctx.moveTo(now.x, now.y);
      ctx.lineTo(now.x - 18 * Math.cos(angle - 0.4), now.y - 18 * Math.sin(angle - 0.4));
      ctx.lineTo(now.x - 18 * Math.cos(angle + 0.4), now.y - 18 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      if (tool === "measure") {
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(label || t("lengthWord"), (start.current.x + now.x) / 2, (start.current.y + now.y) / 2 - 8);
      }
    }
  }

  function up() {
    drawing.current = false;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("copy"))), "image/jpeg", 0.86));
    const form = new FormData();
    form.set("file", blob, "markup.jpg");
    form.set("kind", "markup");
    form.set("derivedFrom", fileId);
    form.set("note", "Markup");
    const response = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
    if (!response.ok) return;
    const data = await response.json();
    router.push(`/jobs/${jobId}/photos/${data.file.id}`);
  }

  return (
    <div className="stack">
      <p className="help">{t("markupHelp")}</p>
      <canvas ref={canvasRef} className="frame" style={{ touchAction: "none", width: "100%", height: "auto" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} />
      <div className="actions two">
        <button type="button" className={tool === "draw" ? "btn dark" : "btn ghost"} onClick={() => setTool("draw")}>{t("draw")}</button>
        <button type="button" className={tool === "arrow" ? "btn dark" : "btn ghost"} onClick={() => setTool("arrow")}>{t("arrow")}</button>
        <button type="button" className={tool === "text" ? "btn dark" : "btn ghost"} onClick={() => setTool("text")}>{t("textTool")}</button>
        <button type="button" className={tool === "measure" ? "btn dark" : "btn ghost"} onClick={() => setTool("measure")}>{t("measure")}</button>
      </div>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setColor("#d4652f")}>{t("colorRed")}</button>
        <button type="button" className="btn ghost" onClick={() => setColor("#ffffff")}>{t("colorWhite")}</button>
        <button type="button" className="btn ghost" onClick={() => setColor("#e0b000")}>{t("colorYellow")}</button>
      </div>
      {tool === "text" ? <input value={text} placeholder={t("textTool")} onChange={(event) => setText(event.target.value)} /> : null}
      {tool === "measure" ? <input value={label} placeholder={t("measureLabel")} onChange={(event) => setLabel(event.target.value)} /> : null}
      <button className="btn primary block" type="button" onClick={save}>{t("saveCopy")}</button>
    </div>
  );
}
