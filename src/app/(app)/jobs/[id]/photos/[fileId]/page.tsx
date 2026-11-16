import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkupPad } from "@/components/MarkupPad";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { listComments } from "@/lib/media";
import { canSeeJob, getFile, getJob, one } from "@/lib/queries";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function PhotoDetailPage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getCurrentUser();
  const { id, fileId } = await params;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  const file = await getFile(fileId);
  if (!job || !file || file.jobId !== id) notFound();
  const { t, locale } = await getI18n();
  const comments = await listComments(fileId);
  const starred = Boolean(one("SELECT 1 AS ok FROM file_stars WHERE user_id = ? AND file_id = ?", user.id, fileId));
  return (
    <div className="stack">
      <Link href={`/jobs/${id}/photos`}>{t("jobPhotos")}</Link>
      <h1>{file.note || file.filename}</h1>
      {file.mime.startsWith("video/") ? (
        <video src={`/api/files/${file.id}`} controls className="frame" />
      ) : (
        <img src={`/api/files/${file.id}`} alt={file.note || t("photoAlt")} />
      )}
      <p className="help">{t("whoAndWhen", { name: file.uploaderName || "", time: formatWhen(file.takenAt || file.createdAt, locale) })}</p>
      <p className="help">{file.latitude != null ? `${file.latitude.toFixed(5)}, ${file.longitude?.toFixed(5)}` : t("noGps")}</p>
      <form action={`/api/files/${file.id}/star`} method="post">
        <input type="hidden" name="next" value={`/jobs/${id}/photos/${file.id}`} />
        <button className="btn ghost" type="submit">{starred ? t("unstar") : t("star")}</button>
      </form>
      {file.mime.startsWith("image/") ? (
        <>
          <h2>{t("markupPage")}</h2>
          <MarkupPad jobId={id} fileId={file.id} src={`/api/files/${file.id}`} />
        </>
      ) : null}
      <section className="stack">
        <h2>{t("comment")}</h2>
        {comments.length === 0 ? <p className="help">{t("noComments")}</p> : null}
        {comments.map((comment) => (
          <article key={String(comment.id)} className="card">
            <strong>{String(comment.user_name || comment.guest_name || "")}</strong>
            <p>{String(comment.body)}</p>
          </article>
        ))}
        <form className="stack" action={`/api/files/${file.id}/comment`} method="post">
          <textarea name="body" required placeholder={t("addComment")} />
          <button className="btn primary" type="submit">{t("send")}</button>
        </form>
      </section>
    </div>
  );
}
