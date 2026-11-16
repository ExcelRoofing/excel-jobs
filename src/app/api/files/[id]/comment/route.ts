import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getFile } from "@/lib/queries";
import { addComment } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const file = await getFile(id);
  if (!file || !(await canSeeJob(auth.user, file.jobId))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = field(input, "next") || `/jobs/${file.jobId}/photos/${id}`;
  try {
    await addComment({ fileId: id, user: auth.user, body: field(input, "body") });
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
