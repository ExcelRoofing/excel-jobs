import { randomUUID } from "crypto";
import { DEFAULT_TAGS } from "./constants";
import { one, rows, run, tx } from "./db";
import { hashPassword, newSecret } from "./password";
import { simplePdf } from "./pdf";
import { renderScene, type SceneKind } from "./png";
import { vapidPublicKey } from "./push";
import { countUsersSync } from "./queries";
import { libraryRelative } from "./services";
import { putBlob, writeLibrary } from "./storage";

const DEMO_PASSWORD = "demo1234";

function insertTags() {
  const tags = DEFAULT_TAGS.map((tag, index) => ({ ...tag, id: randomUUID(), sort: index + 1 }));
  for (const tag of tags) {
    run("INSERT INTO tags (id, name_en, name_fr, slug, sort, active) VALUES (?, ?, ?, ?, ?, 1)", tag.id, tag.en, tag.fr, tag.slug, tag.sort);
  }
  return tags;
}

export async function seedIfEmpty() {
  if (countUsersSync() > 0) return;
  if (process.env.SEED_DEMO === "off") {
    const tags = insertTags();
    void tags;
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
    const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin";
    if (email && password.length >= 8) {
      run(
        `INSERT INTO users (id, name, email, phone, password_hash, role, locale, active, is_demo, created_at)
         VALUES (?, ?, ?, NULL, ?, 'admin', ?, 1, 0, ?)`,
        randomUUID(),
        name,
        email,
        hashPassword(password),
        process.env.BOOTSTRAP_ADMIN_LOCALE === "fr" ? "fr" : "en",
        new Date().toISOString(),
      );
    }
    vapidPublicKey();
    return;
  }
  const now = Date.now();
  const ago = (hours: number) => new Date(now - hours * 3600 * 1000).toISOString();
  const passwordHash = hashPassword(DEMO_PASSWORD);

  const joel = randomUUID();
  const thedy = randomUUID();
  const rina = randomUUID();
  const sam = randomUUID();
  const alexe = randomUUID();
  const people = [
    [joel, "Joel Fernandes", "joel@excelroofing.ca", "604-555-0101", "admin", "en"],
    [thedy, "Thedy Joseph", "thedy@excelroofing.ca", "604-555-0102", "admin", "fr"],
    [rina, "Rina Cole", "rina.cole@demo.excelroofing.ca", "604-555-0103", "office", "en"],
    [sam, "Sam Crowe", "sam.crowe@demo.excelroofing.ca", "604-555-0104", "crew", "en"],
    [alexe, "Alexe Moreau", "alexe.moreau@demo.excelroofing.ca", "604-555-0105", "crew", "fr"],
  ] as const;

  const chen = randomUUID();
  const bergeron = randomUUID();
  const gill = randomUUID();
  const okada = randomUUID();
  const brar = randomUUID();

  let tags: ReturnType<typeof insertTags> = [];
  const tagId = (slug: string) => tags.find((tag) => tag.slug === slug)!.id;

  tx(() => {
    tags = insertTags();
    for (const [id, name, email, phone, role, locale] of people) {
      run(
        `INSERT INTO users (id, name, email, phone, password_hash, role, locale, active, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
        id,
        name,
        email,
        phone,
        passwordHash,
        role,
        locale,
        ago(400),
      );
    }
    const jobs = [
      [chen, "Chen reroof", "Wei Chen", "wei.chen.demo@example.com", "604-555-0191", "1200 Harbour Demo St", "Maple Ridge", "roofing", "in_progress", "Permit filed with the City of Maple Ridge. Dumpster Tuesday. Gate code is 1905. Do not put the gate code on the customer page.", ago(90)],
      [bergeron, "Bergeron skylights", "Claire Bergeron", "claire.bergeron.demo@example.com", "604-555-0192", "88 Lumiere Demo Dr", "Maple Ridge", "skylights", "scheduled", "Kitchen and upstairs hall. Customer prefers mornings. VELUX, curb mount.", ago(60)],
      [gill, "Gill solar", "Amir Gill", "amir.gill.demo@example.com", "604-555-0193", "455 Panel Demo Rd", "Langley", "solar", "lead", "Website lead. Roof age unknown. Site visit before a quote.", ago(50)],
      [okada, "Okada leak repair", "Naomi Okada", "naomi.okada.demo@example.com", "604-555-0194", "16 Rain Demo Cres", "Pitt Meadows", "roofing", "complete", "Leak at the step flashing. Repair finished and invoiced.", ago(120)],
      [brar, "Brar flashing", "Harpreet Brar", "harpreet.brar.demo@example.com", "604-555-0195", "902 Wall Demo St", "Port Coquitlam", "roofing", "in_progress", "West wall flashing pulled off in the last wind storm.", ago(30)],
    ] as const;
    for (const [id, name, customer, email, phone, address, city, division, status, notes, created] of jobs) {
      run(
        `INSERT INTO jobs (id, name, customer_name, customer_email, customer_phone, address, city, division, status, notes, created_by, created_at, updated_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
        id,
        name,
        customer,
        email,
        phone,
        address,
        city,
        division,
        status,
        notes,
        joel,
        created,
        created,
      );
    }
    const members = [
      [chen, sam],
      [chen, alexe],
      [bergeron, alexe],
      [okada, sam],
      [brar, sam],
    ];
    for (const [jobId, userId] of members) {
      run("INSERT INTO job_members (job_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)", jobId, userId, joel, ago(80));
    }

    const messages: [string, string, string, string][] = [
      [chen, thedy, "Customer wants the front slope done first. Gate code is 1905.", ago(30)],
      [chen, joel, "@Sam Crowe dumpster lands Tuesday. Permit is filed.", ago(26)],
      [chen, sam, "On site. North slope is worse than the photos. @Joel Fernandes can you call them?", ago(6)],
      [chen, alexe, "I can do the skylight curb tomorrow morning.", ago(5)],
      [chen, thedy, "@Alexe Moreau yes, 8am. Thank you.", ago(4)],
      [chen, joel, "@Sam Crowe bring extra step flashing tomorrow.", ago(1)],
      [bergeron, thedy, "Mme Bergeron prefere le matin. Puits de lumiere de la cuisine.", ago(20)],
      [bergeron, alexe, "Je suis libre jeudi.", ago(18)],
      [gill, joel, "Site visit Thursday. The roof looks sound enough for an array.", ago(48)],
      [gill, thedy, "Lead came from the website form.", ago(47)],
      [okada, sam, "Leak was the step flashing. Sealed, with new shingles on that slope.", ago(80)],
      [okada, joel, "Invoice is in the files. Marked complete.", ago(70)],
      [brar, sam, "Flashing pulled off the west wall. I need a longer piece.", ago(3)],
    ];
    for (const [jobId, userId, body, at] of messages) {
      const id = randomUUID();
      run("INSERT INTO messages (id, job_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", id, jobId, userId, body, at);
      if (body.includes("@Sam Crowe")) run("INSERT INTO message_mentions (message_id, user_id) VALUES (?, ?)", id, sam);
      if (body.includes("@Joel Fernandes")) run("INSERT INTO message_mentions (message_id, user_id) VALUES (?, ?)", id, joel);
      if (body.includes("@Alexe Moreau")) run("INSERT INTO message_mentions (message_id, user_id) VALUES (?, ?)", id, alexe);
    }

    const cursors: [string, string, string][] = [
      [joel, chen, ago(26)],
      [thedy, chen, ago(6)],
      [sam, chen, ago(5)],
      [alexe, chen, ago(4)],
      [rina, chen, ago(30)],
      [joel, bergeron, ago(18)],
      [thedy, bergeron, ago(18)],
      [alexe, bergeron, ago(18)],
      [joel, gill, ago(47)],
      [thedy, gill, ago(47)],
      [joel, okada, ago(70)],
      [sam, okada, ago(70)],
      [thedy, okada, ago(70)],
      [sam, brar, ago(3)],
    ];
    for (const [userId, jobId, at] of cursors) {
      run("INSERT INTO read_cursors (user_id, job_id, last_read_at) VALUES (?, ?, ?)", userId, jobId, at);
    }

    run(
      `INSERT INTO notifications (id, user_id, job_id, kind, title, body, href, created_at)
       VALUES (?, ?, ?, 'mention', 'Mention on Chen reroof', 'Sam Crowe: On site. North slope is worse than the photos.', ?, ?)`,
      randomUUID(),
      joel,
      chen,
      `/jobs/${chen}/chat`,
      ago(6),
    );
    run(
      `INSERT INTO notifications (id, user_id, job_id, kind, title, body, href, created_at)
       VALUES (?, ?, ?, 'mention', 'Mention on Chen reroof', 'Joel Fernandes: bring extra step flashing tomorrow.', ?, ?)`,
      randomUUID(),
      sam,
      chen,
      `/jobs/${chen}/chat`,
      ago(1),
    );
    run(
      `INSERT INTO notifications (id, user_id, job_id, kind, title, body, href, read_at, created_at)
       VALUES (?, ?, ?, 'chat', 'Message on Bergeron skylights', 'Alexe Moreau: Je suis libre jeudi.', ?, ?, ?)`,
      randomUUID(),
      thedy,
      bergeron,
      `/jobs/${bergeron}/chat`,
      ago(18),
      ago(18),
    );

    const share = randomUUID();
    run(
      "INSERT INTO share_links (id, job_id, token, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
      share,
      chen,
      newSecret(32),
      thedy,
      ago(2),
    );
  });

  const jobName = (id: string) =>
    ({
      [chen]: "Chen reroof",
      [bergeron]: "Bergeron skylights",
      [gill]: "Gill solar",
      [okada]: "Okada leak repair",
      [brar]: "Brar flashing",
    })[id];

  async function photo(
    jobId: string,
    kind: SceneKind,
    tagSlug: string,
    note: string,
    hours: number,
    visible: boolean,
    by: string,
    lat: number,
    lng: number,
  ) {
    const id = randomUUID();
    const tag = tagSlug;
    const filename = `${kind}.png`;
    const stamp = [`EXCEL JOBS  ${ago(hours).slice(0, 16).replace("T", " ")} PT`, `${lat.toFixed(5)}, ${lng.toFixed(5)}`];
    const bytes = renderScene(kind, stamp);
    const folder = tags.find((item) => item.slug === tag)?.en || "Untagged";
    const relative = libraryRelative({ id: jobId, name: jobName(jobId) }, folder, id, filename);
    run(
      `INSERT INTO files (id, job_id, kind, storage_key, filename, mime, size, tag_id, note, taken_at, latitude, longitude, gps_accuracy, customer_visible, uploaded_by, created_at, library_path)
       VALUES (?, ?, 'photo', ?, ?, 'image/png', ?, ?, ?, ?, ?, ?, 12, ?, ?, ?, ?)`,
      id,
      jobId,
      id,
      filename,
      bytes.length,
      tagId(tag),
      note,
      ago(hours),
      lat,
      lng,
      visible ? 1 : 0,
      by,
      ago(hours),
      relative,
    );
    await putBlob(id, bytes, "image/png");
    writeLibrary(relative, bytes);
  }

  await photo(chen, "before", "before", "Front slope before tear-off.", 28, false, sam, 49.2194, -122.5986);
  await photo(chen, "during", "during", "Decking open on the north side.", 8, false, sam, 49.2195, -122.5984);
  await photo(chen, "damage", "damage", "Soft decking near the valley. Team only.", 7, false, sam, 49.2196, -122.5988);
  await photo(chen, "after", "after", "New architectural shingles on the front slope.", 3, true, sam, 49.2194, -122.5986);
  await photo(chen, "safety", "safety", "Tie-off at the ridge.", 9, false, alexe, 49.2193, -122.5982);
  await photo(bergeron, "skylight", "skylight", "Kitchen opening before the new curb.", 19, false, alexe, 49.2261, -122.6012);
  await photo(gill, "solar", "solar", "South roof, possible array location.", 46, false, joel, 49.104, -122.659);
  await photo(okada, "after", "completion", "Step flashing replaced. Slope dried in.", 72, true, sam, 49.221, -122.69);
  await photo(brar, "flashing", "flashing", "West wall flashing lifted.", 3, false, sam, 49.262, -122.781);

  async function doc(jobId: string, filename: string, lines: string[], hours: number, visible: boolean) {
    const id = randomUUID();
    const bytes = simplePdf(lines);
    const relative = libraryRelative({ id: jobId, name: jobName(jobId) }, "Documents", id, filename);
    run(
      `INSERT INTO files (id, job_id, kind, storage_key, filename, mime, size, note, taken_at, customer_visible, uploaded_by, created_at, library_path)
       VALUES (?, ?, 'document', ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?, ?)`,
      id,
      jobId,
      id,
      filename,
      bytes.length,
      "Sample document for the demo.",
      ago(hours),
      visible ? 1 : 0,
      joel,
      ago(hours),
      relative,
    );
    await putBlob(id, bytes, "application/pdf");
    writeLibrary(relative, bytes);
  }

  await doc(
    chen,
    "Chen-quote.pdf",
    ["EXCEL ROOFING & SOLAR", "#607, 12835 Lilley Dr, Maple Ridge", "604-330-1415", "", "QUOTE", "Chen reroof", "1200 Harbour Demo St, Maple Ridge", "", "Architectural shingles, ridge vent,", "gutters, and flashing.", "Labour and materials.", "", "Total: $18,400 plus GST", "Sample document. Valid 30 days."],
    40,
    true,
  );
  await doc(
    chen,
    "Chen-warranty.pdf",
    ["EXCEL ROOFING & SOLAR", "", "WORKMANSHIP WARRANTY", "Chen reroof", "1200 Harbour Demo St", "", "10-year workmanship on the installation.", "Manufacturer warranty on the shingles", "is separate and stays with the product.", "", "Sample warranty for the demo."],
    2,
    true,
  );
  await doc(
    chen,
    "Chen-permit-notes.pdf",
    ["INTERNAL PERMIT NOTES", "Not for the customer.", "", "Permit filed with Maple Ridge.", "Dumpster Tuesday.", "Gate code is 1905.", "", "Team only."],
    24,
    false,
  );
  await doc(
    okada,
    "Okada-invoice.pdf",
    ["EXCEL ROOFING & SOLAR", "", "INVOICE", "Okada leak repair", "16 Rain Demo Cres, Pitt Meadows", "", "Step flashing repair and shingles.", "Total: $1,850 plus GST", "", "Sample invoice. Paid."],
    70,
    true,
  );

  vapidPublicKey();
}

export function seedExtras() {
  const pins: [RegExp, number, number][] = [
    [/harbour demo/i, 49.2194, -122.5986],
    [/lumiere demo/i, 49.2261, -122.6012],
    [/panel demo/i, 49.104, -122.659],
    [/rain demo/i, 49.221, -122.69],
    [/wall demo/i, 49.262, -122.781],
  ];
  const jobs = rowsSafe();
  for (const job of jobs) {
    if (job.latitude != null) continue;
    const hit = pins.find((pin) => pin[0].test(String(job.address)));
    if (hit) run("UPDATE jobs SET latitude = ?, longitude = ?, geocoded_at = ? WHERE id = ?", hit[1], hit[2], new Date().toISOString(), String(job.id));
  }
  if (!one("SELECT id FROM tags WHERE slug = 'before-after'")) {
    const sort = Number(one("SELECT COALESCE(MAX(sort),0)+1 AS n FROM tags")?.n || 11);
    run("INSERT INTO tags (id, name_en, name_fr, slug, sort, active) VALUES (?, 'Before and after', 'Avant et après', 'before-after', ?, 1)", randomUUID(), sort);
  }
  run(`INSERT INTO file_tags (file_id, tag_id)
       SELECT id, tag_id FROM files WHERE tag_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = files.id AND ft.tag_id = files.tag_id)`);
  if (!one("SELECT id FROM labels LIMIT 1")) {
    const labels = [
      ["Warranty", "Garantie", "#1c7c4a"],
      ["Insurance", "Assurance", "#1d6f99"],
      ["Emergency", "Urgence", "#9d2c2c"],
      ["New build", "Construction neuve", "#d4652f"],
    ];
    labels.forEach((label, index) => {
      run("INSERT INTO labels (id, name_en, name_fr, color, sort) VALUES (?, ?, ?, ?, ?)", randomUUID(), label[0], label[1], label[2], index + 1);
    });
  }
  if (!one("SELECT id FROM checklist_templates LIMIT 1")) {
    const id = randomUUID();
    const now = new Date().toISOString();
    run("INSERT INTO checklist_templates (id, name_en, name_fr, created_at) VALUES (?, 'Roof closeout', 'Fin de toiture', ?)", id, now);
    const items = [
      ["Front slope before", "Versant avant, avant les travaux", 1],
      ["Flashing and valleys", "Solins et noues", 1],
      ["Ridge and vents", "Faîte et évents", 1],
      ["Site cleaned up", "Chantier nettoyé", 1],
      ["Customer walkthrough", "Visite avec le client", 0],
    ];
    items.forEach((item, index) => {
      run(
        "INSERT INTO checklist_template_items (id, template_id, sort, title_en, title_fr, photo_required) VALUES (?, ?, ?, ?, ?, ?)",
        randomUUID(),
        id,
        index + 1,
        item[0],
        item[1],
        item[2],
      );
    });
    const sky = randomUUID();
    run("INSERT INTO checklist_templates (id, name_en, name_fr, created_at) VALUES (?, 'Skylight install', 'Pose de puits de lumière', ?)", sky, now);
    run(
      "INSERT INTO checklist_template_items (id, template_id, sort, title_en, title_fr, photo_required) VALUES (?, ?, 1, 'Opening before the curb', 'Ouverture avant le cadre', 1)",
      randomUUID(),
      sky,
    );
    run(
      "INSERT INTO checklist_template_items (id, template_id, sort, title_en, title_fr, photo_required) VALUES (?, ?, 2, 'Flashing and finished curb', 'Solin et cadre fini', 1)",
      randomUUID(),
      sky,
    );
  }
  if (!one("SELECT id FROM activity LIMIT 1")) {
    const recent = rowsSafeFiles();
    for (const file of recent) {
      run(
        "INSERT INTO activity (id, user_id, job_id, file_id, kind, summary, created_at) VALUES (?, ?, ?, ?, 'photo', ?, ?)",
        randomUUID(),
        file.uploaded_by ? String(file.uploaded_by) : null,
        String(file.job_id),
        String(file.id),
        "Photo added",
        String(file.created_at),
      );
    }
  }
}

function rowsSafe() {
  return rows("SELECT id, address, latitude FROM jobs");
}

function rowsSafeFiles() {
  return rows("SELECT id, job_id, uploaded_by, created_at FROM files WHERE kind = 'photo' ORDER BY created_at DESC LIMIT 12");
}
