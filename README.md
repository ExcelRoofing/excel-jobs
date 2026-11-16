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

Run **one** Node process. Chat delivery is in-memory on that process. Do not point two copies at the same SQLite file.

Put the disk in Canada if you can (homeowner photos). A small VPS in Montreal or Toronto is enough.

```bash
# on the server
cp .env.example .env
# edit SESSION_SECRET, APP_URL, DEMO_HINTS=off, COOKIE_SECURE=on
docker compose up -d --build
```

Put Caddy or another HTTPS proxy in front:

```
jobs.excelroofing.ca {
  reverse_proxy localhost:3000
}
```

Keep `/data` on a real disk. The Docker volume `excel-jobs-data` does that. Back it up. A weekly `npm run backup` (or a copy of the volume) plus a copy off the server is enough to start.

Set `APP_URL=https://jobs.excelroofing.ca` so customer links use the public address.

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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional stable phone-alert keys. Otherwise `data/vapid.json` is created. Back that file up, or subscriptions die when the disk does. |
| `DRIVE_SYNC` and the `GOOGLE_*` variables | Drive copy. Off by default. |
| `STORAGE` and the `S3_*` variables | `local` (default) or `s3`. |

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

## Go-live checklist

1. A server with a disk that is not wiped on restart, preferably in Canada.
2. HTTPS on a name such as `jobs.excelroofing.ca`.
3. `SESSION_SECRET` set to a long random string.
4. `APP_URL` set to that https address.
5. `COOKIE_SECURE=on`.
6. `DEMO_HINTS=off`.
7. Change the password on Joel’s and Thedy’s accounts (More → Change password). Turn off Rina, Sam, and Alexe, or delete the demo database and boot with `SEED_DEMO=off` plus `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.
8. Invite the real crew from Team. Send the link by text.
9. Optional: Drive keys, an R2 bucket, and your own VAPID keys.
10. A backup cron. Photos of people’s houses are the thing you cannot lose.

No Roofr key, GoHighLevel key, or email provider is required for this version. Invites are links you send yourself.

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
