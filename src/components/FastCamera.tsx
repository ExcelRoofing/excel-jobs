"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { enqueue } from "@/lib/offline";
import { stampPhoto } from "@/lib/stamp";

type Tag = { id: string; name: string };

export function FastCamera({ jobId, tags, userName }: { jobId: string; tags: Tag[]; userName: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [tagId, setTagId] = useState(tags[0]?.id || "");
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let gone = false;
    navigator.geolocation?.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: true })
      .then((next) => {
        if (gone) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) {
          videoRef.current.srcObject = next;
          videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      gone = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function grab() {
    const video = videoRef.current;
    if (!video || !tagId) {
      setMessage(t("missingTag"));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const raw = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("frame"))), "image/jpeg", 0.86));
    const stamped = await stampPhoto(raw, locale, geo ? { lat: geo.lat, lng: geo.lng } : null, userName);
    await uploadBlob(stamped, "photo.jpg", "image/jpeg", "photo");
  }

  async function burst() {
    for (let i = 0; i < 3; i++) {
      await grab();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    setMessage(t("photoSaved"));
  }

  async function uploadBlob(blob: Blob, filename: string, mime: string, kind: string) {
    const clientId = crypto.randomUUID();
    const form = new FormData();
    form.set("file", blob, filename);
    form.set("kind", kind);
    form.set("tagId", tagId);
    form.set("note", note);
    form.set("takenAt", new Date().toISOString());
    form.set("clientId", clientId);
    if (geo) {
      form.set("latitude", String(geo.lat));
      form.set("longitude", String(geo.lng));
      form.set("gpsAccuracy", String(geo.accuracy));
    }
    try {
      const response = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
      if (!response.ok) throw new Error("upload");
      setMessage(t("savedSee"));
    } catch {
      await enqueue({
        id: clientId,
        type: "photo",
        jobId,
        createdAt: new Date().toISOString(),
        filename,
        mime,
        tagId,
        note,
        takenAt: new Date().toISOString(),
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
        gpsAccuracy: geo?.accuracy ?? null,
        blob,
      });
      setMessage(t("keptSee"));
    }
  }

  function toggleRecord() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (!stream) return;
    if (recording && recorder.current) {
      recorder.current.stop();
      setRecording(false);
      return;
    }
    chunks.current = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      await uploadBlob(blob, "clip.webm", blob.type || "video/webm", "video");
    };
    rec.start();
    setRecording(true);
    window.setTimeout(() => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      setRecording(false);
    }, 60_000);
  }

  if (!ready) return <p className="help">{t("cameraFallback")}</p>;

  return (
    <div className="stack">
      <video ref={videoRef} playsInline muted className="frame" />
      <p className="help">{geo ? t("locationOn") : t("locationOff")} · {t("stampUser")}</p>
      <div className="tags">
        {tags.map((tag) => (
          <button type="button" key={tag.id} className={tagId === tag.id ? "on" : ""} onClick={() => setTagId(tag.id)}>
            {tag.name}
          </button>
        ))}
      </div>
      <input value={note} placeholder={t("noteOptional")} onChange={(event) => setNote(event.target.value)} />
      <button className="btn primary hero-btn" type="button" onClick={grab}>{t("takePhoto")}</button>
      <div className="actions two">
        <button className="btn dark" type="button" onClick={burst}>{t("burst")}</button>
        <button className="btn ghost" type="button" onClick={toggleRecord}>{recording ? t("stopWord") : t("record")}</button>
      </div>
      <p className="help">{t("videoLimit")}</p>
      {message ? <p className="ok" role="status">{message}</p> : null}
      <button className="btn ghost" type="button" onClick={() => router.push(`/jobs/${jobId}/photos`)}>{t("seePhotos")}</button>
    </div>
  );
}
