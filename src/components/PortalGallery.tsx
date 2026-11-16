"use client";

import { useState } from "react";
import { useI18n } from "./I18nProvider";

export function PortalGallery({ photos }: { photos: { id: string; src: string; alt: string }[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  const current = open == null ? null : photos[open];
  return (
    <>
      <div className="gallery">
        {photos.map((photo, index) => (
          <button key={photo.id} type="button" onClick={() => setOpen(index)} style={{ padding: 0, border: 0, background: "transparent" }}>
            <img src={photo.src} alt={photo.alt} />
          </button>
        ))}
      </div>
      {current ? (
        <div className="lightbox" role="dialog">
          <div className="row">
            <button className="btn ghost" type="button" onClick={() => setOpen((open || 0) - 1)} disabled={open === 0}>{t("previous")}</button>
            <span>{t("page", { n: (open || 0) + 1, total: photos.length })}</span>
            <button className="btn ghost" type="button" onClick={() => setOpen((open || 0) + 1)} disabled={open === photos.length - 1}>{t("next")}</button>
            <button className="btn primary" type="button" onClick={() => setOpen(null)}>{t("close")}</button>
          </div>
          <img src={current.src} alt={current.alt} />
        </div>
      ) : null}
    </>
  );
}
