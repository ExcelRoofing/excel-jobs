import { actor, fail, field, json, num, readRequest, redirectTo } from "@/lib/http";
import { canSeeJob, getJob } from "@/lib/queries";
import { AppError, saveUploadedFile } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  const next = field(input, "next") || `/jobs/${id}/files`;
  try {
    const upload = input.form?.get("file");
    if (!(upload instanceof File) || upload.size === 0) throw new AppError("file_missing");
    const requested = field(input, "kind");
    const kind = requested === "photo" || requested === "chat" || requested === "video" || requested === "markup" || requested === "comparison" || requested === "report" ? requested : "document";
    const file = await saveUploadedFile({
      actor: auth.user,
      job,
      kind,
      bytes: Buffer.from(await upload.arrayBuffer()),
      filename: upload.name || "file",
      mime: upload.type || "application/octet-stream",
      tagId: field(input, "tagId") || null,
      note: field(input, "note") || null,
      takenAt: field(input, "takenAt") || null,
      latitude: num(field(input, "latitude")),
      longitude: num(field(input, "longitude")),
      gpsAccuracy: num(field(input, "gpsAccuracy")),
      customerVisible: field(input, "customerVisible") === "1" || field(input, "customerVisible") === "on",
      clientId: field(input, "clientId") || null,
      derivedFromId: field(input, "derivedFrom") || null,
    });
    if (input.asJson) return json({ file });
    return redirectTo(request, next);
  } catch (error) {
    if (input.asJson) return fail(error);
    const code = error instanceof Error && "code" in error ? String((error as { code?: string }).code) : error instanceof Error ? error.message : "server_error";
    return redirectTo(request, next, code);
  }
}
