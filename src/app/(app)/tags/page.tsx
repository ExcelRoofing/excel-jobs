import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAdmin } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n/translate";
import { listTags, tagUsage } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TagsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canAdmin(user.role)) redirect("/more");
  const { e } = await searchParams;
  const { t } = await getI18n();
  const tags = await listTags(true);
  const counts = Object.fromEntries(await Promise.all(tags.map(async (tag) => [tag.id, await tagUsage(tag.id)])));
  return (
    <div className="stack">
      <Link href="/more">{t("back")}</Link>
      <h1>{t("tagsTitle")}</h1>
      <p className="help">{t("tagsHelp")}</p>
      <p className="help">{t("deleteTagHelp")}</p>
      <p className="help">{t("folderKey")}</p>
      {e ? <p className="alert">{t(errorKey(e))}</p> : null}
      {tags.map((tag) => (
        <form key={tag.id} className="card stack" action="/api/tags" method="post">
          <input type="hidden" name="id" value={tag.id} />
          <label className="field"><span>{t("englishName")}</span><input name="nameEn" defaultValue={tag.nameEn} required /></label>
          <label className="field"><span>{t("frenchName")}</span><input name="nameFr" defaultValue={tag.nameFr} required /></label>
          <input type="hidden" name="active" value="0" />
          <label className="check">
            <input type="checkbox" name="active" value="1" defaultChecked={tag.active} />
            <span>{tag.active ? t("showInList") : t("hiddenFromList")}</span>
          </label>
          <p className="help">{t("inUse", { count: counts[tag.id] || 0 })} · {t("slugKey", { slug: tag.slug })}</p>
          <div className="row">
            <button className="btn primary" type="submit">{t("save")}</button>
          </div>
          <div className="row">
            <button className="btn ghost" formAction="/api/tags" name="action" value="up" type="submit">{t("up")}</button>
            <button className="btn ghost" formAction="/api/tags" name="action" value="down" type="submit">{t("down")}</button>
          </div>
        </form>
      ))}
      <form className="card stack" action="/api/tags" method="post">
        <h2>{t("addTag")}</h2>
        <label className="field"><span>{t("englishName")}</span><input name="nameEn" placeholder={t("exampleTag")} required /></label>
        <label className="field"><span>{t("frenchName")}</span><input name="nameFr" placeholder={t("exampleTagFr")} required /></label>
        <button className="btn dark" type="submit">{t("addTag")}</button>
      </form>
    </div>
  );
}
