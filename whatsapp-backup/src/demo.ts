import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { expectedPhotoName, runScenario } from "./scenario.ts";

const dir = await mkdtemp(path.join(tmpdir(), "wa-backup-demo-"));
try {
  const report = await runScenario(dir);
  const photo = expectedPhotoName();
  console.log("WhatsApp backup demo");
  console.log("Fake group message in, fake Google Drive out. No phone and no Google account were used.");
  console.log("");
  console.log("Drive files:");
  for (const file of report.files) console.log(`  ${file.path}`);
  console.log("");
  console.log("Day log:");
  console.log(report.log.trimEnd());
  console.log("");
  console.log("Excel Jobs copies:");
  for (const push of report.pushes) console.log(`  ${push.kind} tag=${push.tagSlug || "-"} ${push.filename} → ${push.jobId}`);
  console.log("");
  console.log(`Drive failures recovered: ${report.failures}`);
  console.log(`Photo filed at: ${photo}`);
  const dupes = report.results.filter((item) => item.result.action === "duplicate").map((item) => item.label);
  console.log(`Duplicates skipped: ${dupes.join(", ") || "none"}`);
  const missing = [
    report.files.some((file) => file.path === photo),
    report.log.includes("On the roof, flashing next"),
    report.log.includes("[photo]"),
    report.pushes.some((push) => push.tagSlug === "before" && push.kind === "photo"),
    report.failures === 1,
    dupes.length === 2,
  ];
  if (missing.some((ok) => !ok)) {
    console.error("Demo checks did not all pass.");
    process.exit(1);
  }
  console.log("Demo checks passed.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
