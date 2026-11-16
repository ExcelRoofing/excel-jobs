import { actor, json } from "@/lib/http";
import { canSeeJob, getJob, listFiles } from "@/lib/queries";
import { zipResponse } from "@/lib/zipjob";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const files = await listFiles(id);
  return zipResponse(job, files);
}
