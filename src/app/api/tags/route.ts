import { actor, fail, field, json, readRequest, redirectTo } from "@/lib/http";
import { moveTag, saveTag } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const input = await readRequest(request);
  try {
    const action = field(input, "action") || "save";
    if (action === "up" || action === "down") await moveTag(auth.user, field(input, "id"), action);
    else {
      const activeValues = input.form ? input.form.getAll("active").map(String) : [field(input, "active")];
      await saveTag(auth.user, {
        id: field(input, "id") || undefined,
        nameEn: field(input, "nameEn"),
        nameFr: field(input, "nameFr"),
        active: activeValues.includes("1") || activeValues.includes("on"),
      });
    }
    if (input.asJson) return json({ ok: true });
    return redirectTo(request, "/tags");
  } catch (error) {
    if (input.asJson) return fail(error);
    return redirectTo(request, "/tags", error instanceof Error ? error.message : "server_error");
  }
}
