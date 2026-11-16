import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { canSeeJob, getJob, listFiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { e } = await searchParams;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const { t } = await getI18n();
  const photos = (await listFiles(id)).filter((file) => file.mime.startsWith("image/"));
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("comparePage")}</h1>
      <p className="help">{t("pickTwo")}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <form className="stack" action={`/api/jobs/${id}/compare`} method="post">
        <label className="field"><span>1</span>
          <select name="beforeId" defaultValue={photos[photos.length - 1]?.id || ""}>
            {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.note || photo.filename}</option>)}
          </select>
        </label>
        <label className="field"><span>2</span>
          <select name="afterId" defaultValue={photos[0]?.id || ""}>
            {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.note || photo.filename}</option>)}
          </select>
        </label>
        <button className="btn primary block" type="submit">{t("saveComparison")}</button>
      </form>
    </div>
  );
}
