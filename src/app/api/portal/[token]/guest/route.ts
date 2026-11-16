import { fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { getJob, shareByToken } from "@/lib/queries";
import { addComment } from "@/lib/media";
import { saveUploadedFile, AppError } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const share = await shareByToken(token);
  const input = await readRequest(request);
  const next = `/portal/${token}`;
  try {
    if (!share || share.revokedAt || share.kind !== "guest") throw new AppError("not_found", 404);
    const job = await getJob(share.jobId);
    if (!job) throw new AppError("not_found", 404);
    const upload = input.form?.get("file");
    if (upload instanceof File && upload.size > 0) {
      await saveUploadedFile({
        actor: null,
        job,
        kind: "photo",
        bytes: Buffer.from(await upload.arrayBuffer()),
        filename: upload.name || "guest.jpg",
        mime: upload.type || "image/jpeg",
        tagId: field(input, "tagId") || null,
        note: `${field(input, "name") || "Guest"}: ${field(input, "note") || "Guest photo"}`,
        notify: true,
      });
    } else if (field(input, "body")) {
      await addComment({
        fileId: field(input, "fileId"),
        user: null,
        guestName: field(input, "name") || "Guest",
        body: field(input, "body"),
      });
    } else throw new AppError("empty_message");
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, next, error instanceof Error ? error.message : "server_error");
  }
}
