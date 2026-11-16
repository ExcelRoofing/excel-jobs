const base = process.env.BASE_URL || "http://127.0.0.1:3000";

function jar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    take(response) {
      const raw = response.headers.getSetCookie?.() || [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
  };
}

async function login(email) {
  const session = jar();
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
    redirect: "manual",
  });
  session.take(response);
  if (!response.ok) throw new Error(`login failed ${email} ${response.status}`);
  return session;
}

async function api(session, path, options = {}) {
  const headers = { ...(options.headers || {}), cookie: session.header() };
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const joel = await login("joel@excelroofing.ca");
const sam = await login("sam.crowe@demo.excelroofing.ca");
const rina = await login("rina.cole@demo.excelroofing.ca");

const joelJobs = await api(joel, "/jobs");
assert(joelJobs.response.ok, "joel jobs page");
assert(joelJobs.text.includes("Chen reroof"), "joel sees Chen");
assert(joelJobs.text.includes("Gill solar"), "joel sees Gill");

const samJobs = await api(sam, "/jobs");
assert(samJobs.text.includes("Chen reroof"), "sam sees Chen");
assert(samJobs.text.includes("Brar flashing"), "sam sees Brar");
assert(!samJobs.text.includes("Gill solar"), "sam does not see Gill");
assert(!samJobs.text.includes("Bergeron skylights"), "sam does not see Bergeron");

const created = await api(joel, "/api/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({
    name: "Smoke test house",
    customerName: "Smoke Customer",
    address: "1 Test Lane",
    city: "Maple Ridge",
    division: "roofing",
    status: "lead",
    notes: "Internal smoke note. Dumpster code 9999.",
  }),
});
assert(created.response.ok, `create job ${created.response.status} ${created.text}`);
const jobId = created.data.job.id;

const hidden = await api(sam, `/jobs/${jobId}`);
assert(hidden.response.status === 404, `sam blocked from new job, got ${hidden.response.status}`);

await api(joel, `/api/jobs/${jobId}/members`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ userId: (await api(joel, "/api/me")).data ? "" : "" }),
});

const team = await api(joel, "/team");
const samId = team.text.match(/sam\.crowe@demo\.excelroofing\.ca[\s\S]{0,400}name="userId" value="([^"]+)"/);
assert(samId, "found sam id on team page");
const added = await api(joel, `/api/jobs/${jobId}/members`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ userId: samId[1] }),
});
assert(added.response.ok, `add member ${added.text}`);

const fromSam = await api(sam, `/api/jobs/${jobId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ body: "On the roof. North side is open.", clientId: "smoke-sam-1" }),
});
assert(fromSam.response.ok, `sam message ${fromSam.text}`);

const fromJoel = await api(joel, `/api/jobs/${jobId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ body: "@Sam Crowe bring extra flashing.", clientId: "smoke-joel-1" }),
});
assert(fromJoel.response.ok, `joel message ${fromJoel.text}`);
assert(fromJoel.data.message.mentionIds.includes(samId[1]), "mention stored");

const dup = await api(joel, `/api/jobs/${jobId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ body: "@Sam Crowe bring extra flashing.", clientId: "smoke-joel-1" }),
});
assert(dup.data.message.id === fromJoel.data.message.id, "message retry is idempotent");

const seen = await api(sam, `/api/jobs/${jobId}/messages`);
assert(seen.text.includes("On the roof") && seen.text.includes("extra flashing"), "both users see the chat");

const alerts = await api(sam, "/alerts");
assert(alerts.text.includes("Chen reroof") || alerts.text.includes("Smoke test house") || alerts.text.includes("Mention"), "sam has an alert");

const stream = await fetch(`${base}/api/jobs/${jobId}/stream`, { headers: { cookie: joel.header() } });
assert(stream.ok && stream.headers.get("content-type")?.includes("text/event-stream"), "sse open");
const reader = stream.body.getReader();
const first = await reader.read();
assert(new TextDecoder().decode(first.value).includes("hello"), "sse hello");
const live = api(sam, `/api/jobs/${jobId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ body: "Live ping from the roof.", clientId: "smoke-live-1" }),
});
const second = await reader.read();
await live;
const chunk = new TextDecoder().decode(second.value);
assert(chunk.includes("Live ping"), `sse delivered message: ${chunk}`);
await reader.cancel();

const tagPage = await api(joel, "/tags");
const tag = tagPage.text.match(/name="id" value="([^"]+)"[\s\S]{0,200}name="nameEn" value="Before"|value="Before"/);
const before = tagPage.text.match(/Before/);
assert(before, "before tag exists");
const tagId = tagPage.text.match(/slugKey[\s\S]{0,80}/) ? null : null;
const beforeId = [...tagPage.text.matchAll(/name="id" value="([^"]+)"/g)].map((match) => match[1]);
const beforeBlock = tagPage.text.split("Before")[0];
const idsBefore = [...beforeBlock.matchAll(/name="id" value="([^"]+)"/g)];
const beforeTag = idsBefore[idsBefore.length - 1]?.[1];
assert(beforeTag, "before tag id");
void tagId;
void beforeId;

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const form = new FormData();
form.set("file", new File([png], "north.jpg", { type: "image/png" }));
form.set("kind", "photo");
form.set("tagId", beforeTag);
form.set("note", "Smoke photo note");
form.set("takenAt", new Date().toISOString());
form.set("latitude", "49.2194");
form.set("longitude", "-122.5986");
form.set("customerVisible", "0");
form.set("clientId", "smoke-photo-1");
const uploaded = await api(joel, `/api/jobs/${jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
assert(uploaded.response.ok, `upload ${uploaded.text}`);
const fileId = uploaded.data.file.id;
assert(uploaded.data.file.customerVisible === false, "office upload respected hidden flag");

const crewForm = new FormData();
crewForm.set("file", new File([png], "crew.jpg", { type: "image/png" }));
crewForm.set("kind", "photo");
crewForm.set("tagId", beforeTag);
crewForm.set("customerVisible", "1");
crewForm.set("clientId", "smoke-photo-crew");
const crewUpload = await api(sam, `/api/jobs/${jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: crewForm });
assert(crewUpload.response.ok, `crew upload ${crewUpload.text}`);
assert(crewUpload.data.file.customerVisible === false, "crew cannot force customer visibility");

const doc = new FormData();
doc.set("file", new File([Buffer.from("%PDF-1.4 smoke")], "quote.pdf", { type: "application/pdf" }));
doc.set("kind", "document");
doc.set("customerVisible", "1");
doc.set("note", "Smoke quote");
const docUpload = await api(joel, `/api/jobs/${jobId}/files`, { method: "POST", headers: { "x-excel-json": "1" }, body: doc });
assert(docUpload.response.ok, `doc ${docUpload.text}`);

const shown = await api(joel, `/api/files/${fileId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ customerVisible: "1" }),
});
assert(shown.response.ok, `show photo ${shown.text}`);

const rinaTags = await api(rina, "/api/tags", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ nameEn: "Nope", nameFr: "Non" }),
});
assert(rinaTags.response.status === 403, "office cannot edit tags");

const share = await api(joel, `/api/jobs/${jobId}/share`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-excel-json": "1" },
  body: JSON.stringify({ action: "create" }),
});
assert(share.response.ok, `share ${share.text}`);
const portalPath = new URL(share.data.url).pathname;
const portal = await fetch(`${base}${portalPath}`);
const html = await portal.text();
assert(portal.ok, "portal opens");
assert(html.includes("Smoke test house"), "portal shows job");
assert(html.includes("quote.pdf"), "portal shows document");
assert(!html.includes("Dumpster code 9999"), "portal hides team notes");
assert(!html.includes("On the roof"), "portal hides chat");
assert(!html.includes("Smoke photo note"), "portal hides photo notes");
const visiblePhoto = html.includes(`/api/portal/`);
assert(visiblePhoto, "portal has a file link");
assert(!html.includes(crewUpload.data.file.id), "hidden crew photo is not on the portal");
assert(html.includes(fileId), "visible photo is on the portal");

const zip = await fetch(`${base}/api/jobs/${jobId}/zip`, { headers: { cookie: joel.header() } });
assert(zip.ok, `zip ${zip.status}`);
const zipBytes = Buffer.from(await zip.arrayBuffer());
assert(zipBytes.subarray(0, 2).toString() === "PK", "zip magic");
const { execFileSync } = await import("node:child_process");
const fs = await import("node:fs");
const path = `/tmp/excel-smoke-${jobId}.zip`;
fs.writeFileSync(path, zipBytes);
const listing = execFileSync("python3", ["-c", `import zipfile; print("\\n".join(zipfile.ZipFile(${JSON.stringify(path)}).namelist()))`], { encoding: "utf8" });
assert(listing.includes("Before/"), `zip has Before folder\n${listing}`);
assert(listing.includes("Documents/"), `zip has Documents folder\n${listing}`);

const french = await login("thedy@excelroofing.ca");
const frPage = await api(french, "/jobs");
assert(frPage.text.includes("Chantiers"), "thedy sees French");
assert(frPage.text.includes("Tous les"), "french filters");

const health = await fetch(`${base}/api/health`);
assert((await health.json()).ok, "health");

console.log("smoke ok");
console.log(JSON.stringify({ jobId, portal: portalPath, zipEntries: listing.trim().split("\n").length }, null, 2));
