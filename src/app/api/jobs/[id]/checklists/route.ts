import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getJob } from "@/lib/queries";
import { applyTemplate, saveChecklistTemplate } from "@/lib/media";
import { getLocale } from "@/lib/i18n";
import { canManage } from "@/lib/constants";
import { AppError } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  try {
    if (field(input, "action") === "template") {
      if (!canManage(auth.user.role)) throw new AppError("forbidden", 403);
      await saveChecklistTemplate(auth.user, field(input, "checklistId"), field(input, "nameEn"), field(input, "nameFr"));
    } else {
      await applyTemplate(auth.user, job, field(input, "templateId"), await getLocale());
    }
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, `/jobs/${id}/checklists`);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, `/jobs/${id}/checklists`, error instanceof Error ? error.message : "server_error");
  }
}
