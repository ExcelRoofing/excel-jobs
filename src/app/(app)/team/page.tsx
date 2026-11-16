import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appOrigin } from "@/lib/origin";
import { getCurrentUser } from "@/lib/auth";
import { canAdmin, canManage, ROLES } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { roleKey } from "@/lib/labels";
import { listInvites, listJobs, listUsers } from "@/lib/queries";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ e?: string; invite?: string; job?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.role)) redirect("/more");
  const query = await searchParams;
  const { t, locale } = await getI18n();
  const people = await listUsers();
  const invites = await listInvites();
  const jobs = await listJobs(user, {});
  const origin = appOrigin(new Request("http://localhost", { headers: await headers() }));
  const admin = canAdmin(user.role);
  const roles = admin ? ROLES : ROLES.filter((role) => role !== "admin");
  return (
    <div className="stack">
      <Link href="/more">{t("back")}</Link>
      <h1>{t("teamTitle")}</h1>
      <p className="help">{t("teamHelp")}</p>
      <p className="help">{t("roleHelpCrew")}</p>
      {query.e ? <p className="alert">{t(errorKey(query.e))}</p> : null}
      {query.invite ? (
        <section className="card stack">
          <p className="ok">{t("inviteReady")}</p>
          <div className="mono">{query.invite}</div>
          <p className="help">{t("sendBy")}</p>
        </section>
      ) : null}
      <form className="card stack" action="/api/team" method="post">
        <h2>{t("invitePerson")}</h2>
        <label className="field"><span>{t("personName")}</span><input name="name" /></label>
        <label className="field"><span>{t("emailOptional")}</span><input name="email" type="email" /></label>
        <label className="field"><span>{t("phoneOptional")}</span><input name="phone" /></label>
        <label className="field">
          <span>{t("role")}</span>
          <select name="role" defaultValue="crew">
            {roles.map((role) => <option key={role} value={role}>{t(roleKey(role))}</option>)}
          </select>
        </label>
        <p className="help">{t("roleHelpOffice")}</p>
        <label className="field">
          <span>{t("optionalJob")}</span>
          <select name="jobId" defaultValue={query.job || ""}>
            <option value="">{t("none")}</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}
          </select>
        </label>
        <p className="help">{t("inviteOnce")}</p>
        <button className="btn primary" type="submit">{t("createInvite")}</button>
      </form>
      <section className="stack">
        <h2>{t("people")}</h2>
        {people.map((person) => (
          <article key={person.id} className="card stack">
            <div className="between">
              <strong>{person.name} {person.id === user.id ? t("youLabel") : ""}</strong>
              <span className="pill">{person.active ? t("on") : t("off")}</span>
            </div>
            <div className="help">{person.email || person.phone}</div>
            {person.isDemo ? <div className="pill in_progress">{t("demoAccount")}</div> : null}
            {admin && person.id !== user.id ? (
              <form className="row" action="/api/team" method="post">
                <input type="hidden" name="action" value="role" />
                <input type="hidden" name="userId" value={person.id} />
                <select name="role" defaultValue={person.role}>
                  {ROLES.map((role) => <option key={role} value={role}>{t(roleKey(role))}</option>)}
                </select>
                <button className="btn ghost" type="submit">{t("saveRole")}</button>
              </form>
            ) : null}
            {admin && person.id !== user.id ? (
              <form action="/api/team" method="post">
                <input type="hidden" name="action" value="active" />
                <input type="hidden" name="userId" value={person.id} />
                <input type="hidden" name="active" value={person.active ? "0" : "1"} />
                <button className="btn ghost" type="submit">{person.active ? t("turnOffAccess") : t("turnOnAccess")}</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
      <section className="stack">
        <h2>{t("pendingInvites")}</h2>
        {invites.filter((invite) => !invite.acceptedAt).length === 0 ? <p className="help">{t("noInvites")}</p> : null}
        {invites.map((invite) => (
          <article key={invite.id} className="card">
            <strong>{invite.name || invite.email || invite.phone}</strong>
            <div className="help">{t(roleKey(invite.role))}{invite.jobName ? ` · ${invite.jobName}` : ""}</div>
            <div className="help">{invite.acceptedAt ? t("usedWord") : t("expiresOn", { time: formatWhen(invite.expiresAt, locale) })}</div>
            {!invite.acceptedAt ? <div className="mono">{`${origin}/invite/${invite.token}`}</div> : null}
            {!invite.acceptedAt ? (
              <form action="/api/team" method="post">
                <input type="hidden" name="action" value="cancel" />
                <input type="hidden" name="inviteId" value={invite.id} />
                <button className="btn ghost" type="submit">{t("cancelInvite")}</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
