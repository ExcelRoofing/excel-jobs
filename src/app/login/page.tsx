import { demoHintsOn } from "@/lib/origin";
import { errorKey } from "@/lib/i18n/translate";
import { getI18n } from "@/lib/i18n";
import { listDemoUsers } from "@/lib/queries";
import { COMPANY } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  const { t, locale } = await getI18n();
  const demos = demoHintsOn() ? await listDemoUsers() : [];
  return (
    <main className="shell main">
      <header className="topbar" style={{ margin: "-16px -14px 18px" }}>
        <div className="brand">
          <strong>{t("appName")}</strong>
        </div>
        <form action="/api/locale" method="post" className="langs">
          <input type="hidden" name="next" value="/login" />
          <button name="locale" value="en" className={locale === "en" ? "on" : ""} type="submit">EN</button>
          <button name="locale" value="fr" className={locale === "fr" ? "on" : ""} type="submit">FR</button>
        </form>
      </header>
      <p className="kicker">{t("tagline")}</p>
      <h1>{t("loginTitle")}</h1>
      {e ? <p className="alert" role="alert">{t(errorKey(e))}</p> : null}
      <form className="stack" action="/api/auth/login" method="post">
        <input type="hidden" name="next" value={next || "/jobs"} />
        <label className="field">
          <span>{t("email")}</span>
          <input name="email" type="email" autoComplete="username" required placeholder="name@email.com" />
        </label>
        <label className="field">
          <span>{t("password")}</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn primary block" type="submit">{t("signIn")}</button>
      </form>
      {demos.length > 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>{t("demoTitle")}</h2>
          <p className="help">{t("demoPasswordNote")}</p>
          <p className="help">{t("demoChangeWarning")}</p>
          <div className="stack">
            {demos.map((user) => (
              <p key={user.id} style={{ margin: 0 }}>
                <strong>{user.name}</strong><br />
                {user.email}
              </p>
            ))}
          </div>
        </section>
      ) : null}
      <p className="help" style={{ marginTop: 18 }}>{t("needHelp")}</p>
      <p className="help">{COMPANY.address}</p>
    </main>
  );
}
