"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "./I18nProvider";

export type MapJob = {
  id: string;
  name: string;
  address: string;
  status: string;
  lat: number;
  lng: number;
};

export function JobMap({ jobs }: { jobs: MapJob[] }) {
  const { t } = useI18n();
  const [active, setActive] = useState(jobs[0]?.id || "");
  if (jobs.length === 0) return <p className="help">{t("mapEmpty")}</p>;
  const lats = jobs.map((job) => job.lat);
  const lngs = jobs.map((job) => job.lng);
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 0.04);
  const lngSpan = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.04);
  const minLat = Math.min(...lats) - latSpan * 0.25;
  const maxLat = Math.max(...lats) + latSpan * 0.25;
  const minLng = Math.min(...lngs) - lngSpan * 0.25;
  const maxLng = Math.max(...lngs) + lngSpan * 0.25;
  const current = jobs.find((job) => job.id === active) || jobs[0];
  return (
    <div className="stack">
      <p className="help">{t("mapHelp")} {t("pinHelp")}</p>
      <div className="card" style={{ position: "relative", height: 360, background: "linear-gradient(#d5e7c8, #c5d7b4 55%, #e7d7c3)", overflow: "hidden" }}>
        {jobs.map((job) => {
          const left = ((job.lng - minLng) / (maxLng - minLng)) * 100;
          const top = (1 - (job.lat - minLat) / (maxLat - minLat)) * 100;
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => setActive(job.id)}
              aria-label={job.name}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: `${top}%`,
                transform: "translate(-50%, -100%)",
                minHeight: 44,
                border: 0,
                borderRadius: 999,
                background: job.id === active ? "#d4652f" : "#121a24",
                color: "white",
                fontWeight: 700,
                padding: "0 10px",
              }}
            >
              {job.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      <article className="card">
        <h2>{current.name}</h2>
        <p>{current.address}</p>
        <p className="help">{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</p>
        <Link className="btn primary" href={`/jobs/${current.id}`}>{t("openJob")}</Link>
      </article>
    </div>
  );
}
