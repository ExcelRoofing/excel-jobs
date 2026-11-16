import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { listActivity } from "@/lib/media";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  const { t, locale } = await getI18n();
  const events = user ? await listActivity(user) : [];
  return (
    <div className="stack">
      <h1>{t("activity")}</h1>
      <p className="help">{t("activityHelp")}</p>
      {events.length === 0 ? <p className="help">{t("activityEmpty")}</p> : null}
      {events.map((event) => (
        <article key={String(event.id)} className="card">
          <strong>{String(event.user_name || t("guestWord"))}</strong>
          <p style={{ margin: "4px 0" }}>{String(event.summary)}</p>
          <p className="help">{String(event.job_name || "")} · {formatWhen(String(event.created_at), locale)} · {String(event.kind)}</p>
          {event.job_id ? <Link href={`/jobs/${event.job_id}`}>{t("openJob")}</Link> : null}
        </article>
      ))}
    </div>
  );
}
