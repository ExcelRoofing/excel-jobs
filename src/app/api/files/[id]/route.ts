import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getFile, getJob } from "@/lib/queries";
import { deleteFile, retryDrive, updateFileMeta } from "@/lib/services";
import { getBlob } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const file = await getFile(id);
  if (!file || !(await canSeeJob(auth.user, file.jobId))) return json({ error: "not_found" }, 404);
  const bytes = await getBlob(file.id);
  const download = new URL(request.url).searchParams.get("download") === "1" || !file.mime.startsWith("image/");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const file = await getFile(id);
  if (!file || !(await canSeeJob(auth.user, file.jobId))) return json({ error: "not_found" }, 404);
  const job = await getJob(file.jobId);
  if (!job) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = field(input, "next") || `/jobs/${file.jobId}/photos`;
  try {
    const action = field(input, "action") || "save";
    if (action === "delete") {
      await deleteFile(auth.user, file);
    } else if (action === "drive") {
      await retryDrive(auth.user, file, job);
    } else {
      await updateFileMeta(auth.user, file, job, {
        tagId: input.form?.has("tagId") || input.body?.tagId !== undefined ? field(input, "tagId") || null : undefined,
        note: input.form?.has("note") || input.body?.note !== undefined ? field(input, "note") : undefined,
        customerVisible:
          field(input, "customerVisible") === ""
            ? undefined
            : field(input, "customerVisible") === "1" || field(input, "customerVisible") === "on",
      });
    }
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
