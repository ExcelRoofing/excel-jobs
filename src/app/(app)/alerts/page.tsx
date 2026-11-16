import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { listNotifications } from "@/lib/queries";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await getCurrentUser();
  const { t, locale } = await getI18n();
  const notes = user ? await listNotifications(user.id) : [];
  const kind = (value: string) => {
    if (value === "mention") return t("alertMention");
    if (value === "photo") return t("alertPhoto");
    if (value === "job") return t("alertJob");
    return t("alertMessage");
  };
  return (
    <div className="stack">
      <div className="between">
        <h1>{t("alertsTitle")}</h1>
        {notes.some((note) => !note.readAt) ? (
          <form action="/api/notifications" method="post">
            <button className="btn ghost" type="submit">{t("markAllRead")}</button>
          </form>
        ) : null}
      </div>
      <p className="help">{t("alertsHelp")}</p>
      <p className="help">{t("inAppAlways")}</p>
      {notes.length === 0 ? <div className="empty"><h2>{t("alertsEmpty")}</h2></div> : null}
      {notes.map((note) => (
        <article key={note.id} className="card">
          <div className="between">
            <span className="pill">{kind(note.kind)}</span>
            {!note.readAt ? <span className="pill in_progress">{t("newWord")}</span> : null}
          </div>
          <h2 style={{ marginTop: 8 }}>{note.title}</h2>
          <p style={{ margin: "4px 0" }}>{note.body}</p>
          <p className="help">{formatWhen(note.createdAt, locale)}</p>
          {note.href ? <Link className="btn dark" href={note.href}>{t("openChat")}</Link> : null}
        </article>
      ))}
    </div>
  );
}
