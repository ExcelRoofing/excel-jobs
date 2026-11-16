import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canManage, DIVISIONS, STATUSES } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { divisionKey, statusKey } from "@/lib/labels";
import { listJobs } from "@/lib/queries";
import { addressLine } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; division?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  const filters = await searchParams;
  const { t } = await getI18n();
  const jobs = user ? await listJobs(user, filters) : [];
  const q = filters.q || "";
  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    const next = { q, division: filters.division || "", status: filters.status || "", ...patch };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const text = params.toString();
    return text ? `/jobs?${text}` : "/jobs";
  };
  return (
    <div className="stack">
      <div className="between">
        <h1>{t("jobs")}</h1>
        <span className="pill">{t("resultCount", { count: jobs.length })}</span>
      </div>
      <p className="kicker">{user && canManage(user.role) ? t("everyJob") : t("onlyYourJobs")}</p>
      {user && canManage(user.role) ? <Link className="btn primary block" href="/jobs/new">{t("newJob")}</Link> : null}
      <form className="search" action="/jobs" method="get">
        <input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("search")} />
        {filters.division ? <input type="hidden" name="division" value={filters.division} /> : null}
        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
        <button className="btn dark" type="submit">{t("search")}</button>
      </form>
      <div className="chips" aria-label={t("status")}>
        <Link className={!filters.status ? "chip on" : "chip"} href={href({ status: "" })}>{t("anyStatus")}</Link>
        {STATUSES.map((status) => (
          <Link key={status} className={filters.status === status ? "chip on" : "chip"} href={href({ status })}>
            {t(statusKey(status))}
          </Link>
        ))}
      </div>
      <div className="chips" aria-label={t("division")}>
        <Link className={!filters.division ? "chip on" : "chip"} href={href({ division: "" })}>{t("anyDivision")}</Link>
        {DIVISIONS.map((division) => (
          <Link key={division} className={filters.division === division ? "chip on" : "chip"} href={href({ division })}>
            {t(divisionKey(division))}
          </Link>
        ))}
      </div>
      {jobs.length === 0 ? (
        <div className="empty">
          <h2>{q || filters.status || filters.division ? t("noJobsMatch") : t("noJobs")}</h2>
          <p className="help">{t("tryAnother")}</p>
        </div>
      ) : (
        <div className="stack">
          {jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className={`card job ${job.division}`}>
              <div className="between">
                <strong>{job.name}</strong>
                {job.unread > 0 ? <span className="pill in_progress">{t("unreadCount", { count: job.unread })}</span> : null}
              </div>
              <div>{job.customerName}</div>
              <div className="meta">{addressLine(job.address, job.city)}</div>
              <div className="row">
                <span className={`pill ${job.division}`}>{t(divisionKey(job.division))}</span>
                <span className={`pill ${job.status}`}>{t(statusKey(job.status))}</span>
                <span className="meta">{t("photosCount", { count: job.photoCount })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
