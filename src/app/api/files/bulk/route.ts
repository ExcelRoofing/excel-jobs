import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canManage } from "@/lib/constants";
import { getFile } from "@/lib/queries";
import { bulkFiles } from "@/lib/media";
import { zipResponse } from "@/lib/zipjob";
import { AppError } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  if (!canManage(auth.user.role) && fieldSafe(request)) {
    /* crew may delete own files through the normal file route; bulk is office */
  }
  const input = await readRequest(request);
  const ids = input.form ? input.form.getAll("ids").map(String) : String(input.body?.ids || "").split(",").filter(Boolean);
  const action = field(input, "action") || "tag";
  const next = field(input, "next") || "/photos";
  try {
    if (!canManage(auth.user.role)) throw new AppError("forbidden", 403);
    if (action === "download") {
      const files = [];
      let job = null;
      for (const id of ids) {
        const file = await getFile(id);
        if (file) files.push(file);
      }
      if (files.length === 0) throw new AppError("file_missing");
      const { getJob } = await import("@/lib/queries");
      job = await getJob(files[0].jobId);
      if (!job) throw new AppError("not_found", 404);
      return zipResponse(job, files);
    }
    await bulkFiles(auth.user, action, ids, {
      tagId: field(input, "tagId") || undefined,
      jobId: field(input, "jobId") || undefined,
      customerVisible: action === "visible" ? field(input, "customerVisible") !== "0" : undefined,
    });
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}

function fieldSafe(_request: Request) {
  return false;
}
