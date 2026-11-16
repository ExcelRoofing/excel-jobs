import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canManage } from "@/lib/constants";
import { canSeeJob, getJob } from "@/lib/queries";
import { makeReport } from "@/lib/media";
import { getLocale } from "@/lib/i18n";
import { AppError } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  if (!canManage(auth.user.role)) return json({ error: "forbidden" }, 403);
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const ids = input.form ? input.form.getAll("fileId").map(String) : String(input.body?.fileIds || "").split(",").filter(Boolean);
  try {
    if (ids.length === 0) throw new AppError("file_missing");
    const file = await makeReport(auth.user, job, field(input, "title"), ids, await getLocale());
    if (input.asJson) return json({ file });
    return redirectTo(request, `/api/files/${file.id}?download=1`);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, `/jobs/${id}/report`, error instanceof Error ? error.message : "server_error");
  }
}
