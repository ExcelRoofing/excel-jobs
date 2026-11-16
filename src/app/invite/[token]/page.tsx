import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { roleKey } from "@/lib/labels";
import { inviteByToken } from "@/lib/queries";
import { nowIso } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const { e } = await searchParams;
  const { t } = await getI18n();
  const invite = await inviteByToken(token);
  const bad = !invite ? "invite_invalid" : invite.acceptedAt ? "invite_used" : invite.expiresAt < nowIso() ? "invite_expired" : "";
  return (
    <main className="shell main stack">
      <h1>{t("inviteTitle")}</h1>
      {bad || e ? (
        <>
          <p className="alert">{t(errorKey(e || bad))}</p>
          <Link className="btn dark" href="/login">{t("signInInstead")}</Link>
        </>
      ) : invite ? (
        <>
          <p>{t("inviteIntro")}</p>
          <p className="help">{t("invitedBy", { name: invite.createdByName })}</p>
          <p>{t("asRole", { role: t(roleKey(invite.role)) })}</p>
          {invite.jobName ? <p>{t("ontoJob", { job: invite.jobName })}</p> : null}
          <form className="stack" action="/api/invites/accept" method="post">
            <input type="hidden" name="token" value={token} />
            <label className="field"><span>{t("yourName")}</span><input name="name" defaultValue={invite.name || ""} required /></label>
            <label className="field"><span>{t("setPassword")}</span><input name="password" type="password" minLength={8} required /></label>
            <label className="field"><span>{t("repeatPassword")}</span><input name="again" type="password" minLength={8} required /></label>
            <p className="help">{t("choosePasswordHelp")}</p>
            <button className="btn primary block" type="submit">{t("join")}</button>
          </form>
          <Link href="/login">{t("signInInstead")}</Link>
        </>
      ) : null}
    </main>
  );
}
