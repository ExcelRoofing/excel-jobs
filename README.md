# Excel Jobs

Excel Jobs is the first working version of an internal tool for [Excel Roofing & Solar](https://excelroofing.ca) in Maple Ridge, BC. It replaces the WhatsApp job groups, the job-photo camera roll, and the ad-hoc customer share.

One job per address. The office sees every job and every chat. Crew and subs see only the jobs they are invited to. The customer gets a private link, with no app and no account.

The screen is built for a phone on a roof: big buttons, short words, English and French.

## What works in this version

- Jobs with name, customer, address, division (Excel Roofing, Excel Skylights, Excel Solar), and status (Lead, Scheduled, In progress, Complete). Search and filter.
- One chat per job. Text, photos, and files. Type `@` to mention someone. Unread counts. An office list of every job chat. In-app alerts. Phone push when a person turns it on.
- Phone camera flow. Pick a tag at capture. Date, time (Pacific), and GPS are written on the photo when the phone allows location. A note sits beside the photo. Timeline per job, filter by tag. If the signal drops, the photo stays on the phone and uploads later.
- Every file is stored by job and tag. Download one zip per job: a folder per tag, plus Documents and Chat.
- A customer link per job. Long random token. The office can turn it off or make a new one, which kills the old link. The page shows status, photos marked “show to customer”, and documents marked the same way. Chat and team notes stay hidden. New photos start hidden.
- Roles: admin, office, crew. Invite by a link you text or email. No per-person fee. Admin can turn access off.

Demo customers, streets, and crew in the sample data are fictional.

## What is ready, but off until you add keys

- **Google Drive copy.** The code is in the app. With `DRIVE_SYNC=on` and a service account, each new file is also copied to `Job name / Tag / file`. Until then, files stay on this server only. See below.
- **S3 or Cloudflare R2.** The code is in the app. Default storage is the server disk. Set `STORAGE=s3` when the disk gets tight.
- **Phone push.** Works after a person taps “Turn on phone alerts”. The server creates `data/vapid.json` on first use if you do not set keys. iPhone needs Add to Home Screen, and iOS 16.4 or newer. Android can also retry uploads in the background. On iPhone, queued photos upload the next time the app is opened with signal.

## CompanyCam parity

CompanyCam (companycam.com, as of November 2026) is the reference for the photo side. This is what a roofing crew and the office use every day, and where Excel Jobs stands.

| CompanyCam feature | Excel Jobs |
| --- | --- |
| Projects on a map, one pin per address | Matched. The Map screen pins every job. Known demo addresses are placed around Maple Ridge. Other addresses are looked up when the network allows. |
| Fast camera, burst, video, date/time/GPS/user stamp | Matched for photos, including a burst of 3 and your name on the stamp. Video records up to about 1 minute or 40 MB. The date, place, and name are saved with the video and shown on the card. They are not burned into the video file. |
| Draw, arrows, text, measurements on a copy | Matched. Markup saves a copy. The original stays. The measurement is a length you type (for example 12 ft), not a LiDAR reading. |
| Before and after, side by side | Matched. Pick two photos. The app saves one combined image tagged Before and after. |
| Tags and filters | Matched. One main tag files the photo. Extra tags can be added in bulk. Filter on the job and in All photos. |
| Photo comments and @mentions | Matched on each photo. |
| Checklists with photo-required steps, and templates | Matched. Roof closeout and skylight templates are included. A required step will not complete without a photo. You can save a job checklist as a new template. |
| Project timeline | Matched. Each job has a Timeline. Filter it to today. |
| Photo report PDF with logo and captions | Matched. Pick photos, title the report, download a PDF with the Excel mark, address, and captions. |
| Gallery and live timeline links, revocable | Matched. The live timeline shows what you turn on for the customer and keeps updating. A gallery is only the photos you tick. Turn a link off from the job. |
| Documents on the job | Matched. |
| Collaborators and guest access | Matched for subs (crew on the job) and a guest link. The guest can view, comment, and add a photo without an account. |
| Office activity feed | Matched. Activity lists photos, comments, checklist steps, and reports. |
| Search photos by tag, date, person, job | Matched on All photos. |
| Bulk select: move, tag, download, share, delete | Matched for office on All photos. |
| Offline capture, upload when the signal returns | Matched. The phone keeps the photo and sends it later. Android can also ask the browser to retry in the background. iPhone sends on the next open with signal. |
| Starred photos | Matched. Star a photo, then filter Starred. |
| Google Drive copy of media | Matched when `DRIVE_SYNC=on`. Photos, video, markups, before-and-after images, and report PDFs use the same job/tag folders. Admin can press “Copy waiting files to Drive” on More. |

Left out on purpose:

- LiDAR measuring, text scanning, and dual video. Those need a native phone app and special sensors. Typed measurements cover the roofing case.
- AI pages, AI checklists, and AI photo summaries. CompanyCam sells those as credits. This version does not call an AI service.
- Card payments, price book, and proposals. CompanyCam payments are for US companies. Excel already keeps quotes and invoices as documents.
- Signatures on documents, project boards, user groups, and the marketing portfolio (Showcase). The daily work is covered by checklists, the map, job members, and the customer link.
- A 10-minute video cap. Clips stop around one minute so a weak cell signal can still upload them.

## Not built yet (the database already has room)

- Sync from Roofr or GoHighLevel (`jobs.source`, `jobs.source_id`, `jobs.source_url`).
- Before/after PDF reports (`reports` table).
- Automatic photo tags (`files.ai_tags`, `files.ai_status`).

## Run it locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The first launch creates `data/excel-jobs.db`, the photo files, and the demo company. Nothing else to sign up for.

Demo password for every sample account: `demo1234`

| Person | Email | Role | Language |
| --- | --- | --- | --- |
| Joel Fernandes | joel@excelroofing.ca | Admin | English |
| Thedy Joseph | thedy@excelroofing.ca | Admin | French |
| Rina Cole | rina.cole@demo.excelroofing.ca | Office | English |
| Sam Crowe | sam.crowe@demo.excelroofing.ca | Crew | English |
| Alexe Moreau | alexe.moreau@demo.excelroofing.ca | Crew | French |

Rina, Sam, and Alexe are fictional, so you can see the office and crew roles. Joel and Thedy are the real operators, with a demo password that must be changed.

Try this:

1. Sign in as Joel. Create a job. Open Chen reroof.
2. Sign in as Sam in another browser. Sam does not see Gill solar or Bergeron skylights. Sam does see Chen.
3. Send a chat from each browser. Mention someone with `@`.
4. On a phone-width window, open Take photo, pick a tag, save. Filter the timeline by that tag.
5. Download the zip. It has a folder per tag.
6. Open the customer link from the job. Only the photos and documents marked for the customer are there. The gate code in the team notes is not.

`npm run smoke` checks that flow against a running server (`BASE_URL`, default `http://127.0.0.1:3000`).

`npm run backup` copies the database, blobs, filing folders, and push keys into `data/backups/<timestamp>/`.

## Phone install

The app is a PWA.

- iPhone: Safari → Share → Add to Home Screen. Then open Excel Jobs from the icon. Phone alerts need that installed icon, and iOS 16.4+.
- Android: Chrome → Install app.

The camera button opens the phone camera. “Choose a photo” opens the library. Both get the date stamp.

## How filing works

The database is the list. The bytes live in `DATA_DIR`:

- `blobs/` is the canonical copy, one file per id.
- `library/` is the human copy: `Job name (id) / Tag / file`.
- The zip is built from the canonical copy and uses the same folders: tag name, `Documents`, and `Chat`.

Tag folders use the English tag name so the whole company shares one filing language. The screen shows the French name when the language is French. Renaming a tag moves the local folder. A Drive copy of an old tag is left in place; use “Try the Drive copy again” if you need a new copy. That limitation is documented because moving files inside Drive needs the folder ids from the first upload, and a rename is rare.

## Deploy

This is the production layout for one Ubuntu 24.04 VPS (the one in Beauharnois is a good fit). Run **one** copy of the app. Chat delivery is in-memory on that process. Do not point two copies at the same SQLite file.

Docker Compose does four things:

- `excel-jobs` listens only on `127.0.0.1:3000`. The public internet cannot open that port.
- `caddy` takes ports 80 and 443, gets a Let's Encrypt certificate for `APP_DOMAIN`, and proxies to the app.
- `backup` makes a local copy every day and, when `RCLONE_REMOTE` is set, copies it off the server. That copy includes the WhatsApp login when that disk has one.
- `whatsapp-backup` is optional. `docker compose --profile whatsapp up -d --build` starts it. It listens only on `127.0.0.1:8787` and reads `whatsapp-backup/.env`.

`.env` is passed into the app and the backup container with `env_file`. The WhatsApp service uses `env_file` on `whatsapp-backup/.env`. `DATA_DIR` is forced to `/data` inside those containers so a laptop value of `./data` does not leak in. Photo tags and the two checklist templates are still created on an empty database. Demo people and demo jobs are not, when `SEED_DEMO=off`.

```bash
cp .env.example .env
# fill in the production values from the checklist below
docker compose up -d --build
```

On a laptop, use `npm run dev`. Compose is for the server. To start only the app container: `docker compose up -d excel-jobs`.

## Production checklist

Do these in order on the VPS before real customer photos.

1. Install Docker Engine and the Compose plugin. Open ports 80 and 443 in the OVH firewall. Leave 3000 closed to the public. The compose file already binds it to `127.0.0.1`.
2. Point DNS for the hostname (for example `jobs.excelroofing.ca`) at the VPS.
3. Clone the repo and create `.env` from `.env.example`.
4. Set `SESSION_SECRET` (`openssl rand -base64 48`).
5. Set `APP_DOMAIN=jobs.excelroofing.ca` and `APP_URL=https://jobs.excelroofing.ca`.
6. Set `ACME_EMAIL` to a mailbox you read. Caddy uses it for Let's Encrypt.
7. Set `COOKIE_SECURE=on` and `DEMO_HINTS=off`.
8. Set `SEED_DEMO=off`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (8 or more characters), and `BOOTSTRAP_ADMIN_LOCALE` (`en` or `fr`). The first boot creates that one admin. It does not create Joel, Thedy, Rina, Sam, Alexe, or the sample jobs.
9. Set the off-server backup (next section) and `BACKUP_REQUIRE_OFFSITE=1`.
10. `docker compose up -d --build`.
11. Open `https://APP_DOMAIN`, sign in as the bootstrap admin, and invite the crew from Team.
12. Optional: `DRIVE_SYNC` and the `GOOGLE_*` keys, `STORAGE=s3` and the `S3_*` keys, and your own `VAPID_*` keys. All of these are read from `.env` inside the container.

No Roofr key, GoHighLevel key, or email provider is required. Invites are links you send yourself.

## Off-server backup

The `backup` container runs `scripts/backup-offsite.sh` every 24 hours. Each run:

1. Copies the database with `VACUUM INTO`, plus `blobs/`, `library/`, and `vapid.json`, into `/data/backups/<timestamp>/`. When the WhatsApp disk has a login, the same folder also gets `whatsapp/`: the session (the spare-phone login), a consistent copy of its queue database, and any `inbox` or `logs` files still waiting to reach Drive. That session is a key to the spare WhatsApp, so the off-server copy has to stay as private as the server disk.
2. Deletes local backup folders older than `BACKUP_RETENTION_DAYS` (default 30).
3. If `RCLONE_REMOTE` is set, copies that folder off the server with rclone and deletes remote files older than the same number of days.

A manual run on the server, against the live disk in the volume:

```bash
docker compose exec backup sh -c 'BACKUP_ONCE=1 /app/scripts/backup-offsite.sh'
```

On a laptop, `npm run backup` only writes `data/backups/`. `npm run backup:offsite` does the same plus rclone when the remote is set.

S3-compatible storage (OVH Object Storage in Beauharnois, Cloudflare R2, or Backblaze B2) needs no config file. In `.env`:

```
RCLONE_REMOTE=excelbackup:excel-jobs
RCLONE_CONFIG_EXCELBACKUP_TYPE=s3
RCLONE_CONFIG_EXCELBACKUP_PROVIDER=Other
RCLONE_CONFIG_EXCELBACKUP_ENDPOINT=https://s3.bhs.io.cloud.ovh.net
RCLONE_CONFIG_EXCELBACKUP_ACCESS_KEY_ID=
RCLONE_CONFIG_EXCELBACKUP_SECRET_ACCESS_KEY=
RCLONE_CONFIG_EXCELBACKUP_ACL=private
BACKUP_RETENTION_DAYS=30
BACKUP_REQUIRE_OFFSITE=1
```

Google Drive instead: on the server run `rclone config`, name the remote, and put the file at `deploy/rclone/rclone.conf` (that path is gitignored). Then set `RCLONE_REMOTE=thatname:ExcelJobsBackups`. The backup container reads `/config/rclone/rclone.conf`.

Until the remote is set, the container still keeps the on-server copies and logs that the off-server copy was skipped. `BACKUP_REQUIRE_OFFSITE=1` makes it exit instead, so Docker restarts it and the failure stays visible. Set that only after a manual run has succeeded.

Photos of people's houses are the thing you cannot lose. Confirm one new folder appears in the remote after the first manual run.

## Environment

See `.env.example`. The app boots with none of them set.

| Variable | Why |
| --- | --- |
| `SESSION_SECRET` | Signs the login cookie. Required before real photos. `openssl rand -base64 48` |
| `APP_URL` | Public https address, no trailing slash. |
| `DATA_DIR` | Database and files. Default `./data`. In Docker, `/data`. |
| `DEMO_HINTS` | `on` (default) lists demo accounts on the sign-in page. Set `off` before go-live. |
| `COOKIE_SECURE` | Set `on` behind https. Leave `off` for local http. |
| `SEED_DEMO` | Default on. Set `off` with the `BOOTSTRAP_ADMIN_*` variables to create one admin and no sample jobs. |
| `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_LOCALE` | The only account created when `SEED_DEMO=off` and the database is empty. Password must be 8 or more characters. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional stable phone-alert keys. Otherwise `data/vapid.json` is created. Back that file up, or subscriptions die when the disk does. |
| `DRIVE_SYNC` and the `GOOGLE_*` variables | Drive copy of job files. Off by default. |
| `STORAGE` and the `S3_*` variables | `local` (default) or `s3` for the live file store. |
| `APP_DOMAIN`, `ACME_EMAIL` | Hostname and contact for the Caddy Let's Encrypt certificate. |
| `RCLONE_REMOTE`, `RCLONE_CONFIG_EXCELBACKUP_*`, `BACKUP_RETENTION_DAYS`, `BACKUP_REQUIRE_OFFSITE` | Daily off-server backup. |

## Google Drive

1. In Google Cloud, create a project and enable the Google Drive API.
2. Create a service account and a JSON key.
3. In Drive, create a folder such as `Excel Jobs`, and share it with the service account email as Editor.
4. Copy the folder id from the Drive URL.
5. Set:

```
DRIVE_SYNC=on
GOOGLE_SERVICE_ACCOUNT_EMAIL=the-service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=the-folder-id
```

New uploads then go to `Job name / Tag`. The server copy remains the source of truth if Drive is down. The file is still saved, and the job shows that the Drive copy did not finish.

## WhatsApp group backup

A separate small service in `whatsapp-backup/` can sit on this same server. It logs into a spare WhatsApp number (one you add to the job groups), saves photos, videos, voice notes, and documents to Google Drive, and can optionally copy a file onto the matching job here. It never sends chat messages. Its settings live in `whatsapp-backup/.env`, which Compose passes in with `env_file`. The daily off-server backup includes the WhatsApp login and any files still waiting to upload. Setup, cost, and the risk of Meta blocking that spare number are in [whatsapp-backup/README.md](whatsapp-backup/README.md).

## Cloudflare R2 or S3

When the VPS disk is the wrong place for years of photos:

```
STORAGE=s3
S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
S3_BUCKET=excel-jobs
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

If `STORAGE=s3` but the keys are missing, the app keeps using the disk and says so on the admin More page.

## Hosting cost

Planning range for about 5 office people and 20 to 40 subs, as of late 2026. Prices move. This is not a quote.

The app is one small Node process plus disk. Chat, auth, and files do not need a second hosted database on day one.

| Piece | Rough monthly cost |
| --- | --- |
| Small VPS, 1–2 GB RAM, in Montreal or Toronto | about $12–24 CAD |
| Disk for photos. A busy month is on the order of 1–2 GB (about 1 MB each after the phone shrinks them). 50–80 GB lasts a long time. Often included, or about $5–10 CAD if you add a volume. | $0–10 CAD |
| Off-server backup of that disk | about $2–5 CAD |
| Domain `excelroofing.ca` | already owned |
| HTTPS | $0 (Caddy or the host’s certificate) |
| Phone alerts | $0 |
| Google Drive | $0 if you use a Drive the company already has |
| Cloudflare R2 instead of a big disk | 10 GB free, then about $0.015 USD per GB |

**About $15–35 CAD per month** for this team, depending on the VPS and how fast the photo library grows.

A managed split (Vercel plus Supabase) is a later option if you outgrow one machine. Budget roughly $0–25 USD while the free tiers hold, then about $50 USD once you leave them. This version does not need that, and it runs before any of those accounts exist.

## Stack

- Next.js (App Router) and React
- SQLite, built into Node 22 (`node:sqlite`), in WAL mode
- Cookie sessions, scrypt passwords
- Files on disk, with an S3-compatible adapter
- Server-Sent Events for the open chat, plus a slow poll so a dead connection still catches up
- IndexedDB queue and a service worker for the offline camera
- Web Push (VAPID) for phone alerts

Why one process instead of Supabase on day one: fewer accounts, one backup, and a cost that stays in the range above. The tradeoff is that realtime chat assumes a single server. That matches this company. If you later need two servers, move the database to Postgres and the fan-out to a hosted realtime service. The SQL is ordinary SQLite.

## Project map

- `src/app` pages and API routes
- `src/lib/db.ts` schema, including the later Roofr, report, and AI columns
- `src/lib/services.ts` jobs, chat, files, invites, tags
- `src/lib/drive.ts` Drive adapter, feature-flagged
- `src/lib/storage.ts` disk and S3/R2
- `src/lib/i18n` English and French copy
- `public/sw.js` installable app, offline page, push handler
