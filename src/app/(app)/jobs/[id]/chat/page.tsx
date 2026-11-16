import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { canSeeJob, getJob, listMessages, listPeopleForMentions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !(await canSeeJob(user, id))) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const { t } = await getI18n();
  const { messages } = await listMessages(id);
  const people = await listPeopleForMentions(id);
  return (
    <div>
      <Link href={`/jobs/${id}`}>{t("backToJob")}</Link>
      <h1>{job.name}</h1>
      <ChatRoom jobId={id} meId={user.id} people={people} initial={messages} />
    </div>
  );
}
