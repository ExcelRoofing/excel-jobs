import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getJob } from "@/lib/queries";
import { makeComparison } from "@/lib/media";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  try {
    const file = await makeComparison(auth.user, job, field(input, "beforeId"), field(input, "afterId"), await getLocale());
    if (input.asJson) return json({ file });
    return redirectTo(request, `/jobs/${id}/photos/${file.id}`);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, `/jobs/${id}/compare`, error instanceof Error ? error.message : "server_error");
  }
}
