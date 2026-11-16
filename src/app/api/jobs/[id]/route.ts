import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getJob } from "@/lib/queries";
import { deleteJob, updateJob } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = field(input, "next") || `/jobs/${id}`;
  try {
    const action = field(input, "action") || "save";
    if (action === "delete") {
      await deleteJob(auth.user, job);
      if (input.asJson) return json({ ok: true });
      return redirectTo(request, "/jobs");
    }
    const patch: Record<string, string> = {};
    for (const key of ["name", "customerName", "customerEmail", "customerPhone", "address", "city", "division", "status", "notes"]) {
      const value = field(input, key);
      if (input.form ? input.form.has(key) : input.body?.[key] !== undefined) patch[key] = value;
    }
    if (action === "status") patch.status = field(input, "status");
    const updated = await updateJob(auth.user, job, patch);
    if (input.asJson) return json({ job: updated });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
