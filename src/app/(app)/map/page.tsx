import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { JobMap } from "@/components/JobMap";
import { ensurePins } from "@/lib/media";
import { listJobs } from "@/lib/queries";
import { addressLine } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const user = await getCurrentUser();
  const { t } = await getI18n();
  const jobs = user ? await listJobs(user, {}) : [];
  if (user) await ensurePins(jobs);
  const fresh = user ? await listJobs(user, {}) : [];
  const pins = fresh
    .filter((job) => job.latitude != null && job.longitude != null)
    .map((job) => ({
      id: job.id,
      name: job.name,
      address: addressLine(job.address, job.city),
      status: job.status,
      lat: job.latitude as number,
      lng: job.longitude as number,
    }));
  return (
    <div className="stack">
      <h1>{t("map")}</h1>
      <JobMap jobs={pins} />
    </div>
  );
}
