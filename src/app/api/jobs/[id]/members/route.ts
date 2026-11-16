import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getJob } from "@/lib/queries";
import { addMember, removeMember } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = `/jobs/${id}`;
  try {
    const userId = field(input, "userId");
    if (field(input, "action") === "remove") await removeMember(auth.user, job, userId);
    else await addMember(auth.user, job, userId);
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, field(input, "action") === "remove" && userId === auth.user.id ? "/jobs" : next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
