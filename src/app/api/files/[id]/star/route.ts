import { actor, field, json, readRequest, redirectTo, wantsJson } from "@/lib/http";
import { canSeeJob, getFile } from "@/lib/queries";
import { toggleStar } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const file = await getFile(id);
  if (!file || !(await canSeeJob(auth.user, file.jobId))) return json({ error: "not_found" }, 404);
  const starred = await toggleStar(auth.user.id, id);
  if (wantsJson(request)) return json({ starred });
  const input = await readRequest(request);
  return redirectTo(request, field(input, "next") || `/jobs/${file.jobId}/photos/${id}`);
}
