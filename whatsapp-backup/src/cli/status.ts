import path from "path";
import { loadConfig } from "../config.ts";
import { Store } from "../store.ts";

const config = loadConfig();
const dbPath = path.join(config.dataDir, "backup.db");
let store: Store;
try {
  store = Store.open(config.dataDir);
} catch (error) {
  console.error(`Could not open ${dbPath}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const counts = store.counts();
console.log(`Connection: ${store.getMeta("connection") || "unknown"}`);
console.log(store.getMeta("connection_detail") || "");
if (store.getMeta("phone")) console.log(`Phone: ${store.getMeta("phone")}`);
console.log(`Queue: waiting ${counts.pending}, working ${counts.running}, needs a person ${counts.dead}, seen ${counts.seen}`);
if (store.getMeta("last_error")) console.log(`Last problem: ${store.getMeta("last_error")}`);
console.log("");
const recent = store.recentUploads(15);
if (!recent.length) console.log("No backups yet.");
for (const row of recent) {
  console.log(`${row.at}  ${row.groupName}  ${row.drivePath}  ${row.jobsStatus}`);
}
