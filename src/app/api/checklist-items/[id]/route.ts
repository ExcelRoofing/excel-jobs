import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { one, ready } from "@/lib/db";
import { canSeeJob } from "@/lib/queries";
import { completeChecklistItem } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  await ready();
  const row = one(
    `SELECT c.job_id AS job_id FROM checklist_items i JOIN checklists c ON c.id = i.checklist_id WHERE i.id = ?`,
    id,
  );
  if (!row || !(await canSeeJob(auth.user, String(row.job_id)))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = field(input, "next") || `/jobs/${row.job_id}/checklists`;
  try {
    await completeChecklistItem(auth.user, id, field(input, "fileId") || null);
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
