import Link from "next/link";
import { getI18n } from "@/lib/i18n";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="shell main">
      <h1>{t("notFoundTitle")}</h1>
      <p className="help">{t("notFoundBody")}</p>
      <Link className="btn primary" href="/jobs">{t("backToJobs")}</Link>
    </main>
  );
}
