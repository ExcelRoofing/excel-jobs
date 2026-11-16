import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getJob } from "@/lib/queries";
import { createShare, revokeShare } from "@/lib/services";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = `/jobs/${id}/share`;
  try {
    const action = field(input, "action") || "create";
    const kind = field(input, "kind") === "gallery" || field(input, "kind") === "guest" ? (field(input, "kind") as "gallery" | "guest") : "timeline";
    if (action === "revoke") {
      await revokeShare(auth.user, job);
      if (input.asJson) return json({ ok: true });
    } else {
      const ids = input.form ? input.form.getAll("fileId").map(String) : String(input.body?.fileIds || "").split(",").filter(Boolean);
      const share = await createShare(auth.user, job, action === "rotate", kind, ids);
      if (input.asJson) {
        const token = "token" in share ? String(share.token) : "";
        return json({ url: `${appOrigin(request)}/portal/${token}` });
      }
    }
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
