import { ready } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ready();
  return Response.json({ ok: true });
}
