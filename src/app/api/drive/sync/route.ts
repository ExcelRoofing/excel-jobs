import { actor, fail, json, redirectTo, wantsJson } from "@/lib/http";
import { syncPendingDrive } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  try {
    const result = await syncPendingDrive(auth.user);
    if (wantsJson(request)) return json(result);
    return redirectTo(request, "/more");
  } catch (error) {
    if (wantsJson(request)) return fail(error);
    return redirectTo(request, "/more", error instanceof Error ? error.message : "server_error");
  }
}
