import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { listJobs } from "@/lib/queries";
import { excerpt } from "@/lib/safe";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  const { q = "" } = await searchParams;
  const { t, locale } = await getI18n();
  const jobs = user ? await listJobs(user, { q }) : [];
  const sorted = [...jobs].sort((a, b) => (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt));
  return (
    <div className="stack">
      <h1>{t("allChats")}</h1>
      <p className="kicker">{user && canManage(user.role) ? t("chatOfficeHelp") : t("chatCrewHelp")}</p>
      <form className="search" action="/chats">
        <input name="q" defaultValue={q} placeholder={t("searchChats")} aria-label={t("searchChats")} />
        <button className="btn dark" type="submit">{t("search")}</button>
      </form>
      {sorted.length === 0 ? <div className="empty"><h2>{t("noChats")}</h2></div> : null}
      {sorted.map((job) => (
        <Link key={job.id} href={`/jobs/${job.id}/chat`} className="card job">
          <div className="between">
            <strong>{job.name}</strong>
            {job.unread > 0 ? <span className="pill in_progress">{t("unreadCount", { count: job.unread })}</span> : null}
          </div>
          <div className="meta">
            {job.lastMessageBody ? `${job.lastMessageName ? `${job.lastMessageName}: ` : ""}${excerpt(job.lastMessageBody, 90)}` : t("noMessagesYet")}
          </div>
          {job.lastMessageAt ? <div className="help">{formatWhen(job.lastMessageAt, locale)}</div> : null}
        </Link>
      ))}
    </div>
  );
}
