import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getCurrentUser } from "@/lib/auth";
import { unreadSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const summary = await unreadSummary(user.id, user.role);
  return (
    <Shell name={user.name} role={user.role} alerts={summary.alerts} chats={summary.chats}>
      {children}
    </Shell>
  );
}
