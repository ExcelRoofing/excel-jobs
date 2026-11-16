import { logout } from "@/lib/auth";
import { redirectTo } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await logout();
  return redirectTo(request, "/login");
}
