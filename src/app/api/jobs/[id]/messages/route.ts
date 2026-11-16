import { actor, fail, field, json, num, readRequest } from "@/lib/http";
import { canSeeJob, getJob, listMessages } from "@/lib/queries";
import { postMessage } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const url = new URL(request.url);
  const data = await listMessages(id, {
    before: url.searchParams.get("before") || undefined,
    after: url.searchParams.get("after") || undefined,
  });
  return json(data);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || !(await canSeeJob(auth.user, id))) return json({ error: "not_found" }, 404);
  const input = await readRequest(request);
  try {
    let file: Parameters<typeof postMessage>[0]["file"];
    if (input.form) {
      const upload = input.form.get("file");
      if (upload instanceof File && upload.size > 0) {
        file = {
          bytes: Buffer.from(await upload.arrayBuffer()),
          filename: upload.name || "file",
          mime: upload.type || "application/octet-stream",
          tagId: field(input, "tagId") || null,
          note: field(input, "note") || null,
          takenAt: field(input, "takenAt") || null,
          latitude: num(field(input, "latitude")),
          longitude: num(field(input, "longitude")),
          gpsAccuracy: num(field(input, "gpsAccuracy")),
        };
      }
    }
    const message = await postMessage({
      actor: auth.user,
      job,
      body: field(input, "body"),
      clientId: field(input, "clientId") || null,
      file,
    });
    if (!input.asJson) {
      const { redirectTo } = await import("@/lib/http");
      return redirectTo(request, `/jobs/${id}/chat`);
    }
    return json({ message });
  } catch (error) {
    if (!input.asJson) {
      const { redirectTo } = await import("@/lib/http");
      return redirectTo(request, `/jobs/${id}/chat`, error instanceof Error ? error.message : "server_error");
    }
    return fail(error);
  }
}
