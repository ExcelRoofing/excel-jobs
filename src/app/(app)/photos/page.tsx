import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { searchPhotos } from "@/lib/media";
import { listTags, listUsers } from "@/lib/queries";
import { tagLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AllPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; user?: string; job?: string; from?: string; to?: string; starred?: string }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const { t, locale } = await getI18n();
  const tags = await listTags(true);
  const people = user && canManage(user.role) ? await listUsers() : [];
  const rows = user
    ? await searchPhotos(user, {
        q: query.q,
        tagId: query.tag,
        userId: query.user,
        jobId: query.job,
        from: query.from,
        to: query.to,
        starred: query.starred === "1",
      })
    : [];
  return (
    <div className="stack">
      <h1>{t("allPhotos")}</h1>
      <p className="help">{t("searchHint")}</p>
      <form className="stack" action="/photos">
        <input name="q" defaultValue={query.q || ""} placeholder={t("searchPhotos")} />
        <div className="row">
          <select name="tag" defaultValue={query.tag || ""} aria-label={t("changeTag")}>
            <option value="">{t("allTags")}</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tagLabel(tag, locale, tag.nameEn)}</option>)}
          </select>
          {people.length > 0 ? (
            <select name="user" defaultValue={query.user || ""} aria-label={t("anyUser")}>
              <option value="">{t("anyUser")}</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          ) : null}
        </div>
        <div className="row">
          <label className="field"><span>{t("fromDate")}</span><input type="date" name="from" defaultValue={query.from || ""} /></label>
          <label className="field"><span>{t("toDate")}</span><input type="date" name="to" defaultValue={query.to || ""} /></label>
        </div>
        <label className="check">
          <input type="checkbox" name="starred" value="1" defaultChecked={query.starred === "1"} />
          <span>{t("starredOnly")}</span>
        </label>
        <button className="btn dark" type="submit">{t("search")}</button>
      </form>
      <p className="help">{t("bulkHint")}</p>
      <form className="stack" action="/api/files/bulk" method="post">
        <input type="hidden" name="next" value="/photos" />
        <div className="photo-grid">
          {rows.map((row) => (
            <label key={String(row.id)} className="card">
              <input type="checkbox" name="ids" value={String(row.id)} />
              {String(row.mime).startsWith("video/") ? <div className="frame">{t("video")}</div> : <img src={`/api/files/${row.id}`} alt="" />}
              <strong>{String(row.job_name || "")}</strong>
              <span className="help">{String(row.tag_name_en || "")} · {String(row.uploader_name || "")}</span>
              <Link href={`/jobs/${row.job_id}/photos/${row.id}`}>{t("open")}</Link>
            </label>
          ))}
        </div>
        {rows.length === 0 ? <p className="help">{t("noPhotos")}</p> : null}
        {user && canManage(user.role) ? (
          <div className="stack">
            <select name="tagId" defaultValue={tags[0]?.id || ""}>
              {tags.filter((tag) => tag.active).map((tag) => <option key={tag.id} value={tag.id}>{tagLabel(tag, locale, tag.nameEn)}</option>)}
            </select>
            <button className="btn dark" name="action" value="tag" type="submit">{t("addTagWord")}</button>
            <button className="btn ghost" name="action" value="visible" type="submit">{t("bulkShare")}</button>
            <button className="btn danger" name="action" value="delete" type="submit">{t("bulkDelete")}</button>
            <button className="btn ghost" name="action" value="download" type="submit">{t("downloadSelected")}</button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
