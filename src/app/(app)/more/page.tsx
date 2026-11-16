import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canAdmin, canManage } from "@/lib/constants";
import { dataDir } from "@/lib/db";
import { driveMode } from "@/lib/drive";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { demoHintsOn } from "@/lib/origin";
import { roleKey } from "@/lib/labels";
import { pushConfigured } from "@/lib/push";
import { secretIsDefault } from "@/lib/session";
import { storageState } from "@/lib/storage";
import { PhoneTools } from "@/components/PhoneTools";

export const dynamic = "force-dynamic";

export default async function MorePage({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await getCurrentUser();
  const { e, ok } = await searchParams;
  const { t } = await getI18n();
  if (!user) return null;
  const drive = driveMode();
  const storage = storageState();
  const push = pushConfigured();
  const secretBad = secretIsDefault();
  const hints = demoHintsOn();
  const https = process.env.COOKIE_SECURE === "on";
  return (
    <div className="stack">
      <h1>{t("moreTitle")}</h1>
      <section className="card">
        <p className="help">{t("signedInAs")}</p>
        <h2>{user.name}</h2>
        <p>{t("yourRoleIs", { role: t(roleKey(user.role)) })}</p>
        <p className="help">{user.role === "admin" ? t("welcomeAdmin") : user.role === "office" ? t("welcomeOffice") : t("welcomeCrew")}</p>
        {user.isDemo ? <p className="banner wait">{t("thisIsDemo")}</p> : null}
      </section>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      {ok === "password" ? <p className="ok">{t("passwordChanged")}</p> : null}
      <section className="card stack">
        <h2>{t("changePassword")}</h2>
        <p className="help">{t("passwordHelp")}</p>
        <form className="stack" action="/api/me" method="post">
          <label className="field"><span>{t("currentPassword")}</span><input type="password" name="current" required /></label>
          <label className="field"><span>{t("newPassword")}</span><input type="password" name="password" minLength={8} required /></label>
          <label className="field"><span>{t("repeatPassword")}</span><input type="password" name="again" minLength={8} required /></label>
          <button className="btn primary" type="submit">{t("save")}</button>
        </form>
      </section>
      {canManage(user.role) ? <Link className="btn dark block" href="/team">{t("openTeam")}</Link> : null}
      {canAdmin(user.role) ? <Link className="btn ghost block" href="/tags">{t("openTags")}</Link> : null}
      <Link className="btn ghost block" href="/outbox">{t("openOutbox")}</Link>
      <Link className="btn ghost block" href="/photos">{t("allPhotos")}</Link>
      <Link className="btn ghost block" href="/activity">{t("activity")}</Link>
      <Link className="btn ghost block" href="/map">{t("map")}</Link>
      <PhoneTools />
      <section className="card stack">
        <h2>{t("driveTitle")}</h2>
        <p>{drive === "on" ? t("driveOn") : drive === "misconfigured" ? t("driveBad") : t("driveOff")}</p>
        <p className="help">{storage === "s3" ? t("storageS3") : t("storageLocal")}</p>
        <p className="help">{t("serverFilingHelp")}</p>
        <p className="help">{t("setupDrive")}</p>
        {user.role === "admin" ? (
          <form action="/api/drive/sync" method="post">
            <button className="btn dark" type="submit">{t("syncDriveAll")}</button>
          </form>
        ) : null}
      </section>
      <details className="helpbox">
        <summary>{t("howTitle")}</summary>
        <ul>
          <li>{t("howJobs")}</li>
          <li>{t("howChat")}</li>
          <li>{t("howPhotos")}</li>
          <li>{t("howFiles")}</li>
          <li>{t("howShare")}</li>
          <li>{t("howCrew")}</li>
          <li>{t("howOffice")}</li>
          <li>{t("howOfflineIphone")}</li>
          <li>{t("howOfflineAndroid")}</li>
        </ul>
        <p className="help">{t("laterNote")}</p>
      </details>
      {canAdmin(user.role) ? (
        <section className="card stack">
          <h2>{t("goLiveTitle")}</h2>
          <p className={secretBad ? "banner wait" : "ok"}>{secretBad ? t("secretWarning") : t("secretOk")}</p>
          <p className={hints ? "banner wait" : "ok"}>{hints ? t("demoWarning") : t("demoHintsOff")}</p>
          <p className="help">{https ? t("httpsOnNote") : t("httpsOffNote")}</p>
          <p className="help">{push ? t("pushReady") : t("pushNotReady")}</p>
          <p className="help">{t("dataDirLabel")}: {dataDir()}</p>
          <p className="help">{t("fixBefore")}</p>
        </section>
      ) : null}
      <p className="help">{t("noPerSeat")} {t("dataStays")}</p>
      <p className="help">{t("needHelp")}</p>
      <form action="/api/auth/logout" method="post">
        <button className="btn danger block" type="submit">{t("logout")}</button>
      </form>
    </div>
  );
}
