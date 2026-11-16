import Link from "next/link";
import { notFound } from "next/navigation";
import { CaptureFlow } from "@/components/CaptureFlow";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { tagLabel } from "@/lib/labels";
import { canSeeJob, getJob, listTags } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const { t, locale } = await getI18n();
  const tags = (await listTags(false)).map((tag) => ({ id: tag.id, name: tagLabel(tag, locale, tag.nameEn) }));
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("captureTitle")}</h1>
      <p className="kicker">{job.name}</p>
      <CaptureFlow jobId={id} tags={tags} />
    </div>
  );
}
