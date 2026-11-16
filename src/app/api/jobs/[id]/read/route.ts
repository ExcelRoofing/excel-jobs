import { actor, field, json, readRequest } from "@/lib/http";
import { canSeeJob, markJobRead } from "@/lib/queries";
import { nowIso } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  await markJobRead(auth.user.id, id, field(input, "at") || nowIso());
  return json({ ok: true });
}
