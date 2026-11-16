import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManage, DIVISIONS, STATUSES } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { divisionHintKey, divisionKey, statusKey } from "@/lib/labels";
import { listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.role)) redirect("/jobs");
  const { e } = await searchParams;
  const { t } = await getI18n();
  const people = (await listUsers()).filter((person) => person.active && person.role === "crew");
  return (
    <div className="stack">
      <Link href="/jobs">{t("backToJobs")}</Link>
      <h1>{t("newJob")}</h1>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <form className="stack" action="/api/jobs" method="post">
        <label className="field">
          <span>{t("jobName")} · {t("required")}</span>
          <input name="name" required placeholder={t("exampleJob")} />
        </label>
        <label className="field">
          <span>{t("customerName")} · {t("required")}</span>
          <input name="customerName" required placeholder={t("exampleCustomer")} />
        </label>
        <label className="field">
          <span>{t("address")} · {t("required")}</span>
          <input name="address" required placeholder={t("exampleAddress")} />
        </label>
        <label className="field">
          <span>{t("city")} · {t("optional")}</span>
          <input name="city" placeholder={t("exampleCity")} />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>{t("phoneOptional")}</span>
            <input name="customerPhone" inputMode="tel" />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{t("emailOptional")}</span>
            <input name="customerEmail" type="email" />
          </label>
        </div>
        <div>
          <h2>{t("pickDivision")}</h2>
          <div className="seg">
            {DIVISIONS.map((division) => (
              <label key={division} className="pick">
                <input type="radio" name="division" value={division} required />
                {t(divisionKey(division))}
                <small>{t(divisionHintKey(division))}</small>
              </label>
            ))}
          </div>
        </div>
        <div>
          <h2>{t("pickStatus")}</h2>
          <div className="seg">
            {STATUSES.map((status) => (
              <label key={status} className="pick">
                <input type="radio" name="status" value={status} defaultChecked={status === "lead"} />
                {t(statusKey(status))}
              </label>
            ))}
          </div>
          <p className="help">{t("willStartAs")}</p>
        </div>
        <label className="field">
          <span>{t("notesOptional")}</span>
          <textarea name="notes" placeholder={t("gateHint")} />
        </label>
        <p className="help">{t("internalNotes")}</p>
        <div>
          <h2>{t("crewNow")}</h2>
          <p className="help">{t("crewNowHelp")}</p>
          <div className="stack">
            {people.map((person) => (
              <label key={person.id} className="check">
                <input type="checkbox" name="crew" value={person.id} />
                <span>{person.name}</span>
              </label>
            ))}
            {people.length === 0 ? <p className="help">{t("noPeople")}</p> : null}
          </div>
        </div>
        <button className="btn primary block" type="submit">{t("createJob")}</button>
      </form>
    </div>
  );
}
