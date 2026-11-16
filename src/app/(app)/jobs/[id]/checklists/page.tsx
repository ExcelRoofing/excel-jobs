import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { listChecklists, listTemplates } from "@/lib/media";
import { canSeeJob, getJob, listFiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ChecklistsPage({
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
  const { t, locale } = await getI18n();
  const templates = await listTemplates();
  const lists = await listChecklists(id);
  const photos = await listFiles(id, "photo");
  return (
    <div className="stack">
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{t("checklists")}</h1>
      <p className="help">{t("checklistHelp")}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      <form className="card stack" action={`/api/jobs/${id}/checklists`} method="post">
        <h2>{t("fromTemplate")}</h2>
        <select name="templateId" defaultValue={String(templates[0]?.id || "")}>
          {templates.map((template) => (
            <option key={String(template.id)} value={String(template.id)}>
              {locale === "fr" ? String(template.name_fr) : String(template.name_en)}
            </option>
          ))}
        </select>
        <button className="btn primary" type="submit">{t("createChecklist")}</button>
      </form>
      {lists.length === 0 ? <p className="help">{t("noSteps")}</p> : null}
      {lists.map((entry) => {
        const list = entry as Record<string, unknown> & { items: Record<string, unknown>[] };
        const items = list.items;
        const done = items.filter((item) => item.completed_at).length;
        return (
          <section key={String(list.id)} className="card stack">
            <h2>{String(list.name)}</h2>
            <p className="help">{t("doneSteps", { done, total: items.length })}</p>
            {items.map((item) => (
              <article key={String(item.id)} className="stack">
                <strong>{String(item.title)} {Number(item.photo_required) === 1 ? `· ${t("photoRequired")}` : ""}</strong>
                {item.completed_at ? <p className="ok">{t("completed")}</p> : (
                  <form action={`/api/checklist-items/${item.id}`} method="post" className="stack">
                    <input type="hidden" name="next" value={`/jobs/${id}/checklists`} />
                    {Number(item.photo_required) === 1 ? (
                      <select name="fileId" required defaultValue="">
                        <option value="" disabled>{t("useThisPhoto")}</option>
                        {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.note || photo.filename}</option>)}
                      </select>
                    ) : null}
                    <button className="btn dark" type="submit">{t("markDone")}</button>
                  </form>
                )}
              </article>
            ))}
            {user && canManage(user.role) ? (
              <form action={`/api/jobs/${id}/checklists`} method="post" className="stack">
                <input type="hidden" name="action" value="template" />
                <input type="hidden" name="checklistId" value={String(list.id)} />
                <input name="nameEn" placeholder={t("englishName")} required />
                <input name="nameFr" placeholder={t("frenchName")} required />
                <button className="btn ghost" type="submit">{t("saveTemplate")}</button>
              </form>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
