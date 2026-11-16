import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMPANY } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { divisionKey, statusKey } from "@/lib/labels";
import { getJob, shareByToken, visiblePortalFiles } from "@/lib/queries";
import { addressLine, mapsHref } from "@/lib/safe";
import { formatWhen } from "@/lib/time";
import { STATUSES } from "@/lib/constants";
import { PortalGallery } from "@/components/PortalGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await shareByToken(token);
  const { t, locale } = await getI18n();
  if (!share || share.revokedAt) {
    return (
      <main className="portal">
        <header className="portal-hero">
          <div>{t("companyName")}</div>
          <h1>{t("portalClosed")}</h1>
          <p>{t("portalClosedHelp")}</p>
          <p><a href={COMPANY.phoneHref}>{t("callOffice")} {COMPANY.phoneDisplay}</a></p>
        </header>
      </main>
    );
  }
  const job = await getJob(share.jobId);
  if (!job) notFound();
  const files = await visiblePortalFiles(job.id);
  const photos = files.filter((file) => file.kind === "photo");
  const docs = files.filter((file) => file.kind === "document");
  const full = addressLine(job.address, job.city);
  return (
    <main className="portal">
      <header className="portal-hero">
        <div className="between">
          <strong>{t("companyName")}</strong>
          <form action="/api/locale" method="post" className="langs">
            <input type="hidden" name="next" value={`/portal/${token}`} />
            <button name="locale" value="en" className={locale === "en" ? "on" : ""} type="submit">EN</button>
            <button name="locale" value="fr" className={locale === "fr" ? "on" : ""} type="submit">FR</button>
          </form>
        </div>
        <p style={{ marginBottom: 0 }}>{t("brandLine")}</p>
        <h1>{job.name}</h1>
        <p>{job.customerName}<br />{full}</p>
        <div className="steps" aria-label={t("whereJobIs")}>
          {STATUSES.map((status) => (
            <div key={status} className={status === job.status ? "step on" : "step"}>{t(statusKey(status))}</div>
          ))}
        </div>
      </header>
      <section className="stack" style={{ padding: 18 }}>
        <p className="help">{t("privateLink")}</p>
        <p>{t("divisionIs", { division: t(divisionKey(job.division)) })}</p>
        <div className="row">
          <a className="btn dark" href={COMPANY.phoneHref}>{t("callOffice")}</a>
          <a className="btn ghost" href={mapsHref(full)}>{t("openInMaps")}</a>
          <a className="btn ghost" href={`mailto:${COMPANY.email}`}>{t("emailOffice")}</a>
        </div>
        <h2>{t("portalPhotos")}</h2>
        <p className="help">{t("tapPhoto")}</p>
        {photos.length === 0 ? <p>{t("portalNoPhotos")}</p> : <PortalGallery photos={photos.map((file) => ({ id: file.id, alt: t("photoAlt"), src: `/api/portal/${token}/files/${file.id}` }))} />}
        <h2>{t("portalDocs")}</h2>
        {docs.length === 0 ? <p>{t("portalNoDocs")}</p> : null}
        {docs.map((file) => (
          <a key={file.id} className="doc" href={`/api/portal/${token}/files/${file.id}`}>
            <span>
              <strong>{file.filename}</strong>
              <span className="help"> {formatWhen(file.createdAt, locale)}</span>
            </span>
            <span>{t("downloadThis")}</span>
          </a>
        ))}
        <p>{t("thanksLine")}</p>
        <p className="help">{t("questionsCall")}<br />{COMPANY.address}</p>
        <p className="help">{t("madeBy")}</p>
      </section>
    </main>
  );
}
