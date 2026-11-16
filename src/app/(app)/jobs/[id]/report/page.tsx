import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { canSeeJob, getJob, listFiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { e } = await searchParams;
  if (!user || !(await canSeeJob(user, id))) notFound();
  if (!canManage(user.role)) redirect(`/jobs/${id}`);
  const job = await getJob(id);
  if (!job) notFound();
  const { t } = await getI18n();
  const photos = (await listFiles(id)).filter((file) => file.mime.startsWith("image/"));
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("report")}</h1>
      <p className="help">{t("reportHelp")}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <form className="stack" action={`/api/jobs/${id}/report`} method="post">
        <label className="field"><span>{t("reportTitle")}</span><input name="title" defaultValue={`${job.name}`} required /></label>
        {photos.map((photo) => (
          <label key={photo.id} className="check">
            <input type="checkbox" name="fileId" value={photo.id} defaultChecked={photo.customerVisible} />
            <span>
              <img src={`/api/files/${photo.id}`} alt="" style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 8 }} />
              {photo.note || photo.tagNameEn || photo.filename}
            </span>
          </label>
        ))}
        <button className="btn primary block" type="submit">{t("buildReport")}</button>
      </form>
    </div>
  );
}
