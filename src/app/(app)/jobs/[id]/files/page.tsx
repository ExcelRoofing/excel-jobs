import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { canSeeJob, getJob, listFiles } from "@/lib/queries";
import { formatBytes, formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function FilesPage({
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
  const job = await getJob(id);
  if (!job) notFound();
  const { t, locale } = await getI18n();
  const files = await listFiles(id);
  const docs = files.filter((file) => file.kind === "document");
  const office = canManage(user.role);
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("jobFiles")}</h1>
      <p className="help">{t("filesHelp")}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <section className="card stack">
        <h2>{t("downloadZip")}</h2>
        <p className="help">{t("zipExplain")}</p>
        <p className="banner wait">{t("zipWarning")}</p>
        <a className="btn dark block" href={`/api/jobs/${id}/zip`}>{t("downloadZip")}</a>
      </section>
      {office ? (
        <form className="card stack" action={`/api/jobs/${id}/files`} method="post" encType="multipart/form-data">
          <h2>{t("uploadDocument")}</h2>
          <input type="hidden" name="kind" value="document" />
          <input type="hidden" name="next" value={`/jobs/${id}/files`} />
          <input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,application/pdf,image/*" />
          <p className="help">{t("maxSize")}</p>
          <label className="check">
            <input type="checkbox" name="customerVisible" value="1" />
            <span>{t("customerWillSee")}</span>
          </label>
          <label className="field">
            <span>{t("noteOptional")}</span>
            <input name="note" />
          </label>
          <button className="btn primary" type="submit">{t("upload")}</button>
        </form>
      ) : <p className="help">{t("docOfficeOnly")}</p>}
      <section className="stack">
        <h2>{t("documents")}</h2>
        {docs.length === 0 ? <p className="help">{t("noDocuments")}</p> : null}
        {docs.map((file) => (
          <article key={file.id} className="card between">
            <div>
              <strong>{file.filename}</strong>
              <div className="help">{formatBytes(file.size)} · {formatWhen(file.createdAt, locale)}</div>
              <div className="help">{file.customerVisible ? t("onCustomerPage") : t("teamOnly")}</div>
              <div className="help">{t("filedUnder", { tag: t("documentsFolder") })}</div>
            </div>
            <a className="btn ghost" href={`/api/files/${file.id}?download=1`}>{t("download")}</a>
          </article>
        ))}
      </section>
      <p className="help">{t("chatFileNote")}</p>
    </div>
  );
}
