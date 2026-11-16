import { json } from "@/lib/http";
import { getFile, getJob, shareByToken } from "@/lib/queries";
import { getBlob } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await context.params;
  const share = await shareByToken(token);
  if (!share || share.revokedAt) return json({ error: "not_found" }, 404);
  const file = await getFile(id);
  const job = await getJob(share.jobId);
  if (!file || !job || file.jobId !== job.id || !file.customerVisible) return json({ error: "not_found" }, 404);
  const bytes = await getBlob(file.id);
  const download = !file.mime.startsWith("image/");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
