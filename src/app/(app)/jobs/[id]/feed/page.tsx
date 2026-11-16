import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { jobFeed } from "@/lib/media";
import { canSeeJob, getJob } from "@/lib/queries";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function FeedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ today?: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { today } = await searchParams;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const { t, locale } = await getI18n();
  let events = await jobFeed(id);
  if (today === "1") {
    const day = new Date().toISOString().slice(0, 10);
    events = events.filter((event) => event.at.slice(0, 10) === day);
  }
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("projectFeed")}</h1>
      <p className="help">{job.name}. {t("feedHelp")}</p>
      <div className="row">
        <Link className={!today ? "chip on" : "chip"} href={`/jobs/${id}/feed`}>{t("all")}</Link>
        <Link className={today === "1" ? "chip on" : "chip"} href={`/jobs/${id}/feed?today=1`}>{t("todayWord")}</Link>
      </div>
      {events.length === 0 ? <p className="help">{t("nothingOnFeed")}</p> : null}
      {events.map((event) => (
        <Link key={event.id} href={event.href} className="card">
          <strong>{event.title}</strong>
          <p className="help">{event.kind} · {event.who || ""} · {formatWhen(event.at, locale)}</p>
        </Link>
      ))}
    </div>
  );
}
