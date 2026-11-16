import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAdmin, canManage, STATUSES } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { divisionKey, statusKey } from "@/lib/labels";
import { activeShare, canSeeJob, getJob, listFiles, listMembers, listUsers } from "@/lib/queries";
import { addressLine, mapsHref } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { e } = await searchParams;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const { t } = await getI18n();
  const members = await listMembers(id);
  const photos = await listFiles(id, "photo");
  const share = await activeShare(id);
  const office = canManage(user.role);
  const candidates = office ? (await listUsers()).filter((person) => person.active && !members.some((member) => member.id === person.id) && person.role === "crew") : [];
  const fullAddress = addressLine(job.address, job.city);
  return (
    <div className="stack">
      <Link href="/jobs">{t("backToJobs")}</Link>
      <div className="row">
        <span className={`pill ${job.division}`}>{t(divisionKey(job.division))}</span>
        <span className={`pill ${job.status}`}>{t(statusKey(job.status))}</span>
      </div>
      <h1>{job.name}</h1>
      <p className="kicker" style={{ margin: 0 }}>{job.customerName}<br />{fullAddress}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <div className="actions two">
        <a className="btn dark" href={mapsHref(fullAddress)}>{t("directions")}</a>
        {job.customerPhone ? <a className="btn ghost" href={`tel:${job.customerPhone}`}>{t("callCustomer")}</a> : <span className="btn ghost">{t("noPhone")}</span>}
      </div>
      <Link className="btn primary hero-btn" href={`/jobs/${id}/capture`}>{t("takePhoto")}</Link>
      <div className="actions two">
        <Link className="btn dark" href={`/jobs/${id}/chat`}>{t("jobChat")}</Link>
        <Link className="btn ghost" href={`/jobs/${id}/photos`}>{t("jobPhotos")} · {photos.length}</Link>
        <Link className="btn ghost" href={`/jobs/${id}/files`}>{t("jobFiles")}</Link>
        {office ? <Link className="btn ghost" href={`/jobs/${id}/share`}>{share ? t("linkIsOn") : t("customerLink")}</Link> : null}
      </div>
      {office ? (
        <section className="card">
          <h2>{t("status")}</h2>
          <div className="seg">
            {STATUSES.map((status) => (
              <form key={status} action={`/api/jobs/${id}`} method="post">
                <input type="hidden" name="action" value="status" />
                <input type="hidden" name="status" value={status} />
                <button className={job.status === status ? "on" : ""} type="submit">{t(statusKey(status))}</button>
              </form>
            ))}
          </div>
        </section>
      ) : (
        <p className="help">{t("officeChangesStatus")}</p>
      )}
      <section className="card">
        <h2>{t("teamNotes")}</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{job.notes || t("noNotes")}</p>
        <p className="help">{t("internalNotes")}</p>
      </section>
      <section className="card stack">
        <h2>{t("peopleOnJob")}</h2>
        <p className="help">{t("officeAlways")}</p>
        {members.length === 0 ? <p className="help">{t("noCrew")}</p> : null}
        {members.map((member) => (
          <div key={member.id} className="between">
            <span>{member.name}</span>
            {office && member.id !== user.id ? (
              <form action={`/api/jobs/${id}/members`} method="post">
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="userId" value={member.id} />
                <button className="btn ghost" type="submit">{t("remove")}</button>
              </form>
            ) : null}
            {!office && member.id === user.id ? (
              <form action={`/api/jobs/${id}/members`} method="post">
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="userId" value={member.id} />
                <button className="btn ghost" type="submit">{t("leaveJob")}</button>
              </form>
            ) : null}
          </div>
        ))}
        {office && candidates.length > 0 ? (
          <form className="row" action={`/api/jobs/${id}/members`} method="post">
            <select name="userId" aria-label={t("choosePerson")} defaultValue={candidates[0]?.id}>
              {candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <button className="btn dark" type="submit">{t("add")}</button>
          </form>
        ) : null}
        {office ? <Link href={`/team?job=${id}`}>{t("inviteNew")}</Link> : null}
      </section>
      {office ? (
        <details className="helpbox">
          <summary>{t("editJob")}</summary>
          <form className="stack" action={`/api/jobs/${id}`} method="post">
            <input type="hidden" name="action" value="save" />
            <label className="field"><span>{t("jobName")}</span><input name="name" defaultValue={job.name} required /></label>
            <label className="field"><span>{t("customerName")}</span><input name="customerName" defaultValue={job.customerName} required /></label>
            <label className="field"><span>{t("address")}</span><input name="address" defaultValue={job.address} required /></label>
            <label className="field"><span>{t("city")}</span><input name="city" defaultValue={job.city || ""} /></label>
            <label className="field"><span>{t("phone")}</span><input name="customerPhone" defaultValue={job.customerPhone || ""} /></label>
            <label className="field"><span>{t("email")}</span><input name="customerEmail" defaultValue={job.customerEmail || ""} /></label>
            <label className="field"><span>{t("notes")}</span><textarea name="notes" defaultValue={job.notes || ""} /></label>
            <input type="hidden" name="division" value={job.division} />
            <input type="hidden" name="status" value={job.status} />
            <button className="btn primary" type="submit">{t("saveChanges")}</button>
          </form>
        </details>
      ) : null}
      {canAdmin(user.role) ? (
        <form action={`/api/jobs/${id}`} method="post">
          <input type="hidden" name="action" value="delete" />
          <p className="help">{t("deleteJobConfirm")}</p>
          <button className="btn danger block" type="submit">{t("deleteJob")}</button>
        </form>
      ) : null}
    </div>
  );
}
