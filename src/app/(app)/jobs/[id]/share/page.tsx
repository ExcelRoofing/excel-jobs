import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { activeShare, canSeeJob, getJob, listFiles, rows } from "@/lib/queries";
import { appOrigin } from "@/lib/origin";
import { formatWhen } from "@/lib/time";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { e } = await searchParams;
  if (!user || !(await canSeeJob(user, id))) notFound();
  if (!canManage(user.role)) redirect(`/jobs/${id}`);
  const job = await getJob(id);
  if (!job) notFound();
  const { t, locale } = await getI18n();
  const share = await activeShare(id);
  const headerList = await headers();
  const origin = appOrigin(new Request("http://localhost", { headers: headerList }));
  const url = share ? `${origin}/portal/${share.token}` : "";
  const files = await listFiles(id);
  const shared = files.filter((file) => file.customerVisible).length;
  const sms = job.customerPhone ? `sms:${job.customerPhone}?&body=${encodeURIComponent(t("shareSmsBody", { url }))}` : "";
  const mail = job.customerEmail
    ? `mailto:${job.customerEmail}?subject=${encodeURIComponent(t("shareMailSubject"))}&body=${encodeURIComponent(t("shareMailBody", { url }))}`
    : "";
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("shareTitle")}</h1>
      <p className="help">{t("shareHelp")}</p>
      <p className="help">{t("noLoginNeeded")}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <p className={share ? "ok" : "banner wait"}>{share ? t("linkIsOn") : t("noLinkYet")}</p>
      <p className="help">{t("markedCount", { count: shared })}. {t("onlyMarked")}</p>
      {share ? (
        <section className="card stack">
          <div className="mono">{url}</div>
          <p className="help">{t("madeAt", { time: formatWhen(share.createdAt, locale) })}</p>
          <div className="row">
            {sms ? <a className="btn dark" href={sms}>{t("textLink")}</a> : null}
            {mail ? <a className="btn ghost" href={mail}>{t("emailLink")}</a> : null}
            <a className="btn ghost" href={url}>{t("viewPortal")}</a>
          </div>
          {!sms && !mail ? <p className="help">{t("noCustomerContact")}</p> : null}
          <form action={`/api/jobs/${id}/share`} method="post">
            <input type="hidden" name="action" value="rotate" />
            <button className="btn ghost block" type="submit">{t("makeNewLink")}</button>
          </form>
          <form action={`/api/jobs/${id}/share`} method="post">
            <input type="hidden" name="action" value="revoke" />
            <button className="btn danger block" type="submit">{t("turnOffLink")}</button>
          </form>
        </section>
      ) : (
        <form action={`/api/jobs/${id}/share`} method="post">
          <button className="btn primary block" type="submit">{t("turnOnLink")}</button>
        </form>
      )}
      <p className="help">{t("timelineHelp")}</p>
      <p className="help">{t("galleryHelp")}</p>
      <form className="card stack" action={`/api/jobs/${id}/share`} method="post">
        <input type="hidden" name="kind" value="gallery" />
        <h2>{t("makeGallery")}</h2>
        {files.filter((file) => file.mime.startsWith("image/")).map((file) => (
          <label key={file.id} className="check">
            <input type="checkbox" name="fileId" value={file.id} />
            <span>{file.note || file.filename}</span>
          </label>
        ))}
        <button className="btn dark" type="submit">{t("makeGallery")}</button>
      </form>
      <form action={`/api/jobs/${id}/share`} method="post">
        <input type="hidden" name="kind" value="guest" />
        <button className="btn ghost block" type="submit">{t("makeGuest")}</button>
      </form>
      <p className="help">{t("guestHelp")}</p>
      {rows("SELECT token, kind FROM share_links WHERE job_id = ? AND revoked_at IS NULL", id).map((link) => (
        <p key={String(link.token)} className="mono">{String(link.kind)} · {origin}/portal/{String(link.token)}</p>
      ))}
    </div>
  );
}
