import { actor, fail, field, readRequest, redirectTo } from "@/lib/http";
import { createJob } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await actor();
  if ("error" in auth) return auth.error;
  const input = await readRequest(request);
  try {
    const crew = input.form ? input.form.getAll("crew").map(String) : String(input.body?.crewIds || "").split(",").filter(Boolean);
    const job = await createJob(auth.user, {
      name: field(input, "name"),
      customerName: field(input, "customerName"),
      customerEmail: field(input, "customerEmail"),
      customerPhone: field(input, "customerPhone"),
      address: field(input, "address"),
      city: field(input, "city"),
      division: field(input, "division"),
      status: field(input, "status") || "lead",
      notes: field(input, "notes"),
      crewIds: crew,
    });
    if (input.asJson) return Response.json({ job });
    return redirectTo(request, `/jobs/${job.id}`);
  } catch (error) {
    if (input.asJson) return fail(error);
    const code = error instanceof Error ? error.message : "server_error";
    return redirectTo(request, "/jobs/new", code);
  }
}
