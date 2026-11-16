import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { appOrigin } from "@/lib/origin";
import { isRole } from "@/lib/constants";
import { cancelInvite, createInvite, setUserActive, setUserRole } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const input = await readRequest(request);
  const action = field(input, "action") || "invite";
  try {
    if (action === "role") {
      const role = field(input, "role");
      if (!isRole(role)) throw new Error("forbidden");
      await setUserRole(auth.user, field(input, "userId"), role);
    } else if (action === "active") {
      await setUserActive(auth.user, field(input, "userId"), field(input, "active") === "1");
    } else if (action === "cancel") {
      await cancelInvite(auth.user, field(input, "inviteId"));
    } else {
      const invite = await createInvite(auth.user, {
        name: field(input, "name"),
        email: field(input, "email"),
        phone: field(input, "phone"),
        role: field(input, "role") || "crew",
        jobId: field(input, "jobId") || null,
      });
      const url = `${appOrigin(request)}/invite/${invite.token}`;
      if (input.asJson) return json({ url });
      return redirectTo(request, `/team?invite=${encodeURIComponent(url)}`);
    }
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, "/team");
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, "/team", error instanceof Error ? error.message : "server_error");
  }
}
