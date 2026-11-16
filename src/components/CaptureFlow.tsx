"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { enqueue } from "@/lib/offline";
import { stampPhoto } from "@/lib/stamp";

type Tag = { id: string; name: string };

export function CaptureFlow({ jobId, tags }: { jobId: string; tags: Tag[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [stamped, setStamped] = useState<Blob | null>(null);
  const [tagId, setTagId] = useState("");
  const [note, setNote] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoState, setGeoState] = useState<"checking" | "on" | "off" | "blocked">("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState("off");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setGeoState("on");
      },
      (error) => setGeoState(error.code === error.PERMISSION_DENIED ? "blocked" : "off"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  async function choose(next: File | null) {
    setMessage("");
    setFile(next);
    setStamped(null);
    if (preview) URL.revokeObjectURL(preview);
    if (!next) {
      setPreview("");
      return;
    }
    setBusy(true);
    try {
      const blob = await stampPhoto(next, locale, geo ? { lat: geo.lat, lng: geo.lng } : null);
      setStamped(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setStamped(null);
      setPreview(URL.createObjectURL(next));
      setMessage(t("cannotRead"));
    } finally {
      setBusy(false);
    }
  }

  async function save(another: boolean) {
    if (!file && !stamped) return;
    if (!tagId) {
      setMessage(t("missingTag"));
      return;
    }
    setBusy(true);
    setMessage("");
    const blob = stamped || file;
    if (!blob) return;
    const clientId = crypto.randomUUID();
    const takenAt = new Date().toISOString();
    const form = new FormData();
    form.set("file", blob, "photo.jpg");
    form.set("kind", "photo");
    form.set("tagId", tagId);
    form.set("note", note);
    form.set("takenAt", takenAt);
    form.set("clientId", clientId);
    if (geo) {
      form.set("latitude", String(geo.lat));
      form.set("longitude", String(geo.lng));
      form.set("gpsAccuracy", String(geo.accuracy));
    }
    try {
      const response = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status !== 401 && data.error && data.error !== "server_error") {
          setMessage(t("errorGeneric"));
          setBusy(false);
          return;
        }
        throw new Error("upload");
      }
      setMessage(t("savedSee"));
      if (another) {
        setFile(null);
        setStamped(null);
        setPreview("");
        setNote("");
        setTagId("");
      } else router.push(`/jobs/${jobId}/photos`);
    } catch {
      await enqueue({
        id: clientId,
        type: "photo",
        jobId,
        createdAt: takenAt,
        filename: "photo.jpg",
        mime: "image/jpeg",
        tagId,
        note,
        takenAt,
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
        gpsAccuracy: geo?.accuracy ?? null,
        blob,
      });
      setMessage(t("keptSee"));
      if (!another) router.push("/outbox");
    } finally {
      setBusy(false);
    }
  }

  const geoText = geoState === "checking" ? t("locationChecking") : geoState === "on" ? t("locationOn") : geoState === "blocked" ? t("locationBlocked") : t("locationOff");

  return (
    <div className="stack">
      <p className="help">{t("captureHelp")}</p>
      <p className={geoState === "on" ? "ok" : "banner wait"}>{geoText}</p>
      {!preview ? (
        <div className="stack">
          <label className="btn primary hero-btn">
            {t("useCamera")}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(event) => choose(event.target.files?.[0] || null)} />
          </label>
          <label className="btn dark block">
            {t("choosePhoto")}
            <input type="file" accept="image/*" hidden onChange={(event) => choose(event.target.files?.[0] || null)} />
          </label>
        </div>
      ) : (
        <div className="stack">
          <img src={preview} alt={t("previewImage")} className="frame" />
          <p className="help">{t("stampPreview")}</p>
          <button type="button" className="btn ghost" onClick={() => choose(null)}>{t("retake")}</button>
        </div>
      )}
      <div>
        <h2>{t("pickTag")}</h2>
        <p className="help">{t("tagIsFolder")}</p>
        <div className="tags">
          {tags.map((tag) => (
            <button type="button" key={tag.id} className={tagId === tag.id ? "on" : ""} onClick={() => setTagId(tag.id)}>
              {tag.name}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>{t("noteOptional")}</span>
        <textarea value={note} placeholder={t("notePlaceholder")} onChange={(event) => setNote(event.target.value)} />
      </label>
      <p className="help">{t("noteNotOnImage")}</p>
      <p className="help">{t("stampHint")}</p>
      <p className="help">{t("whoSeesPhoto")}</p>
      {message ? <p className="banner wait" role="status">{message}</p> : null}
      <button className="btn primary block" type="button" disabled={busy || !preview} onClick={() => save(false)}>
        {busy ? t("preparing") : t("savePhoto")}
      </button>
      <button className="btn dark block" type="button" disabled={busy || !preview} onClick={() => save(true)}>
        {t("saveAndAnother")}
      </button>
      <noscript>
        <form className="stack" action={`/api/jobs/${jobId}/files`} method="post" encType="multipart/form-data">
          <p>{t("basicUploadHelp")}</p>
          <input type="hidden" name="kind" value="photo" />
          <input type="hidden" name="next" value={`/jobs/${jobId}/photos`} />
          <input type="file" name="file" accept="image/*" capture="environment" required />
          <select name="tagId" required defaultValue="">
            <option value="" disabled>{t("pickTag")}</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
          <textarea name="note" placeholder={t("noteOptional")} />
          <button className="btn primary" type="submit">{t("basicUpload")}</button>
        </form>
      </noscript>
    </div>
  );
}
