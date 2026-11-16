import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { tagLabel } from "@/lib/labels";
import { canSeeJob, getJob, listFiles, listTags } from "@/lib/queries";
import { formatWhen } from "@/lib/time";
import { mapsHref } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function PhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tag?: string; e?: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const query = await searchParams;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const { t, locale } = await getI18n();
  const tags = await listTags(true);
  const all = await listFiles(id, "photo");
  const shown = query.tag ? all.filter((file) => file.tagId === query.tag) : all;
  const office = canManage(user.role);
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <div className="between">
        <h1>{t("jobPhotos")}</h1>
        <Link className="btn primary" href={`/jobs/${id}/capture`}>{t("takePhoto")}</Link>
      </div>
      <p className="help">{t("photoHelp")} {t("countShown", { shown: shown.length, total: all.length })}</p>
      {office ? <p className="help">{t("defaultHidden")}</p> : <p className="help">{t("crewNoToggle")}</p>}
      {query.e ? <p className="alert">{t(errorKey(query.e))}</p> : null}
      <div className="chips">
        <Link className={!query.tag ? "chip on" : "chip"} href={`/jobs/${id}/photos`}>{t("allTags")}</Link>
        {tags.filter((tag) => tag.active || all.some((file) => file.tagId === tag.id)).map((tag) => (
          <Link key={tag.id} className={query.tag === tag.id ? "chip on" : "chip"} href={`/jobs/${id}/photos?tag=${tag.id}`}>
            {tagLabel(tag, locale, tag.nameEn)}
          </Link>
        ))}
      </div>
      {shown.length === 0 ? <div className="empty"><h2>{query.tag ? t("noPhotosTag") : t("noPhotos")}</h2></div> : null}
      <div className="photo-grid">
        {shown.map((file) => {
          const tag = tags.find((item) => item.id === file.tagId) || null;
          const label = tagLabel(tag, locale, t("untagged"));
          return (
            <article key={file.id} className="card stack">
              <a href={`/api/files/${file.id}`}><img src={`/api/files/${file.id}`} alt={file.note || t("photoAlt")} /></a>
              <Link href={`/jobs/${id}/photos/${file.id}`}>{t("markup")}</Link>
              <div className="row">
                <span className="pill">{label}</span>
                <span className={file.customerVisible ? "pill complete" : "pill"}>{file.customerVisible ? t("onCustomerPage") : t("teamOnly")}</span>
              </div>
              <p style={{ margin: 0 }}>{file.note || t("noteNone")}</p>
              <p className="help" style={{ margin: 0 }}>{t("taken", { time: formatWhen(file.takenAt || file.createdAt, locale) })} · {t("uploadedBy", { name: file.uploaderName || "" })}</p>
              <p className="help" style={{ margin: 0 }}>{t("filedUnder", { tag: file.tagNameEn || t("untagged") })}</p>
              {file.latitude != null && file.longitude != null ? (
                <a href={mapsHref(`${file.latitude},${file.longitude}`)}>{t("openMap")} · {file.latitude.toFixed(5)}, {file.longitude.toFixed(5)}</a>
              ) : <span className="help">{t("noGps")}</span>}
              {office ? (
                <form action={`/api/files/${file.id}`} method="post">
                  <input type="hidden" name="next" value={`/jobs/${id}/photos${query.tag ? `?tag=${query.tag}` : ""}`} />
                  <input type="hidden" name="customerVisible" value={file.customerVisible ? "0" : "1"} />
                  <button className="btn block" type="submit">{file.customerVisible ? t("hideFromCustomer") : t("showToCustomer")}</button>
                </form>
              ) : null}
              {office ? (
                <form className="row" action={`/api/files/${file.id}`} method="post">
                  <input type="hidden" name="next" value={`/jobs/${id}/photos`} />
                  <select name="tagId" defaultValue={file.tagId || ""} aria-label={t("changeTag")}>
                    {tags.filter((item) => item.active).map((item) => (
                      <option key={item.id} value={item.id}>{tagLabel(item, locale, item.nameEn)}</option>
                    ))}
                  </select>
                  <button className="btn ghost" type="submit">{t("save")}</button>
                </form>
              ) : null}
              {office || file.uploadedBy === user.id ? (
                <form action={`/api/files/${file.id}`} method="post">
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="next" value={`/jobs/${id}/photos`} />
                  <button className="btn danger" type="submit">{t("delete")}</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
