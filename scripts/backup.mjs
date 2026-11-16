import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const dbFile = path.join(dataDir, "excel-jobs.db");
if (!fs.existsSync(dbFile)) {
  console.error(`No database at ${dbFile}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(dataDir, "backups", stamp);
fs.mkdirSync(dest, { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(`VACUUM INTO '${path.join(dest, "excel-jobs.db").replaceAll("'", "''")}'`);
db.close();
for (const folder of ["blobs", "library"]) {
  const from = path.join(dataDir, folder);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(dest, folder), { recursive: true });
}
const vapid = path.join(dataDir, "vapid.json");
if (fs.existsSync(vapid)) fs.copyFileSync(vapid, path.join(dest, "vapid.json"));
console.log(dest);
