# WhatsApp backup for Excel Roofing

This is a small program that sits next to Excel Jobs on the same server. It logs into a **spare WhatsApp number** and copies job-group photos, videos, voice notes, and documents into Google Drive.

It does not type in the groups. It does not mark messages read. It does not replace Excel Jobs. Drive is the filing cabinet. Excel Jobs is still the app the crew uses.

You need a second phone number that is **not** your personal WhatsApp and **not** the number customers already text. Put WhatsApp on that number, then add it to each job group. The program links to that phone the same way WhatsApp Web does: you scan a QR code once. After that, the login is saved on the server and survives a restart.

## What it files

Inside the Drive folder you choose:

```
WhatsApp Backup / Group name / 2026-03-14 / 143022_before+flashing_Sam-Crowe_roof_ph01.jpg
WhatsApp Backup / Group name / 2026-03-14 / messages.txt
```

- The clock is Pacific time (Vancouver).
- The file name has the time, the sender, and the original file name.
- `messages.txt` in that day's folder is the text chat for the day, plus a short line for each photo or file.
- The same photo is not uploaded twice. A retry waits and tries again if the network or Drive fails. A failed file stays on the server disk until it goes up, or until you press Retry on the admin page.

If the caption has a tag word, the file goes in a folder with that tag, and the tag is added to the file name. The first tag in the caption wins the folder. English and French both count:

| Folder | Words that count |
| --- | --- |
| Before | before, avant |
| During | during, pendant |
| After | after, apres, après |
| Damage | damage, dommage, dommages |
| Flashing | flashing, solin, solins |
| Skylight | skylight, puits de lumière |
| Solar | solar, solaire |
| Materials | materials, material, matériaux, matériel |
| Safety | safety, sécurité |
| Completion | completion, fin des travaux |

A word inside another word does not count. "beforehand" is not Before.

Only **group** chats are saved. A private message to the spare number is ignored.

## What you need before you start

1. The spare phone, with WhatsApp installed and able to receive a text.
2. A Google account the company controls. This is where the photos will live.
3. The same server that runs Excel Jobs. Node.js 22 or newer if you are not using Docker.
4. About 15 quiet minutes the first time.

## Step 1. Get the program on the server

The files live in the `whatsapp-backup` folder of the Excel Jobs project.

On your own computer, to try it:

```bash
cd whatsapp-backup
npm install
cp .env.example .env
```

On the server, the Docker steps are at the bottom. Do the Google steps first so the `.env` file is ready.

## Step 2. Let Google Drive accept the photos

Pick **one** login. Do not fill in both.

### Path A. A normal Gmail (this is the one most companies should use)

A service account cannot store files in a normal personal Drive. Google rejects those uploads. Use this path unless you already use a Google Workspace Shared Drive.

1. On a computer, open [Google Cloud Console](https://console.cloud.google.com) while signed in as the company Google account.
2. Create a project. Name it `Excel WhatsApp Backup`.
3. Open **APIs & Services → Library**. Search for **Google Drive API**. Click **Enable**.
4. Open **APIs & Services → OAuth consent screen**.
   - User type: **External** (or Internal, if this Google account is on Workspace).
   - App name: `Excel WhatsApp Backup`.
   - Add the company Gmail as a test user.
   - Then click **Publish app**. Leave it unverified. Google will show a warning later. That warning is normal for a private tool used only by you.
   - If you skip Publish, Google throws the login away after 7 days and backups stop until you sign in again.
5. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Desktop app** (or Web, if Desktop is not offered).
   - Name: `Excel backup`.
   - If it asks for a redirect, add exactly `http://127.0.0.1:8765`
6. Copy the client id and the client secret into `whatsapp-backup/.env`:

```
GOOGLE_OAUTH_CLIENT_ID=paste-id
GOOGLE_OAUTH_CLIENT_SECRET=paste-secret
```

7. On a computer that has a browser (your laptop is fine; the server often has none), from the `whatsapp-backup` folder:

```bash
npm install
npm run auth
```

8. The terminal prints a long address. Open it. Sign in as the company Google account. Google says the app is not verified. Click **Advanced**, then continue, then **Allow**.
9. The terminal prints `GOOGLE_OAUTH_REFRESH_TOKEN=...`. Paste that line into `.env`.
10. In Drive, create a folder named `WhatsApp Backup`. Open it. The address looks like `https://drive.google.com/drive/folders/THIS-PART`. Copy `THIS-PART` into:

```
GOOGLE_DRIVE_ROOT_FOLDER_ID=THIS-PART
```

Do this once. The token stays valid until someone revokes it in the Google account, or until you delete it.

### Path B. A Shared Drive and a service account

Use this only if the company has Google Workspace and the folder lives in a **Shared Drive**, not in "My Drive".

1. In Google Cloud, create a project, enable the Drive API, and create a **service account**.
2. Create a JSON key and download it.
3. In the Shared Drive, add the service account email as a **Content manager**.
4. Create `WhatsApp Backup` inside that Shared Drive. Copy the folder id as above.
5. Put these in `.env`. Keep the quotes. The key is one line, with `\n` where the line breaks were:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=the-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=the-folder-id
```

If uploads fail and the admin page mentions quota, you are on Path B against a personal Drive. Switch to Path A.

## Step 3. Set the admin password

The status page shows a QR code that logs a phone into WhatsApp. Protect it.

```bash
openssl rand -hex 24
```

Put the result in `.env` as `ADMIN_TOKEN`.

Leave `HOST=127.0.0.1` if you open the page on the server itself. Docker (below) listens inside the container and only publishes the page to the server, not to the public internet.

## Step 4. Link the spare phone

```bash
npm run build
npm start
```

On the server, open `http://127.0.0.1:8787/?token=YOUR-ADMIN-TOKEN`.

You should see a QR code.

On the spare phone: **WhatsApp → Settings → Linked devices → Link a device**. Scan the code.

The page then says connected, and lists the groups that number is in. Add the number to a job group if the list is empty. New photos in those groups start filing within a few seconds.

The login is stored in the data folder (`data/session`). You do not scan again after a restart, unless WhatsApp logs the device out.

To check from a terminal without the page:

```bash
npm run status
```

## Optional. Also copy files into Excel Jobs

Leave this off until Drive is working.

1. In Excel Jobs, open the job. The address is `/jobs/` plus a long id. Copy that id.
2. Copy `group-map.example.json` to `group-map.json`. One row per group. `group` is the WhatsApp group name (the same spelling) or the group id ending in `@g.us`. `defaultTag` is used when a photo has no tag word in the caption. Use a slug from the table above, such as `during`.
3. In `.env`:

```
EXCEL_JOBS_PUSH=on
EXCEL_JOBS_URL=http://127.0.0.1:3000
EXCEL_JOBS_EMAIL=the-office-login@excelroofing.ca
EXCEL_JOBS_PASSWORD=that-password
EXCEL_JOBS_GROUP_MAP=./group-map.json
```

Use an **office or admin** login. A crew login cannot upload documents.

What gets copied:

- Photos, into the job, with the caption tag or the default tag. New photos stay hidden from the customer, same as a normal upload.
- A photo with no tag word and no default tag still goes into the job, under Chat.
- PDF, Word, Excel, and plain text files go in as documents.
- Video and voice notes stay in Drive only. Excel Jobs does not accept those types yet.
- Files over 20 MB stay in Drive only. That is the Excel Jobs limit.

The copy uses the normal Excel Jobs upload. It will not add the same WhatsApp file twice.

## Run it on the server with Docker

From the Excel Jobs project folder, after `whatsapp-backup/.env` exists:

```bash
docker compose --profile whatsapp up -d --build
```

Compose reads that file with `env_file`. Inside the container, `DATA_DIR` is `/data` and the page is published only on the server's `127.0.0.1:8787`, even if the file says `./data` or `HOST=127.0.0.1` for a laptop.

This does not change the Excel Jobs container. The backup page is only on the server: `http://127.0.0.1:8787/?token=...`.

Do not publish port 8787 to the public internet. If you put Caddy in front of it, require the token and do not leave the QR page open to the world.

The data disk is the Docker volume `whatsapp-backup-data`. The daily Excel Jobs backup container mounts that volume and copies the WhatsApp login, the queue database, and files still waiting into the same off-server backup as the job photos. Losing the volume without that copy means scanning the QR again. It does not delete files already in Drive.

`docker compose up` without the profile does not start this program. The daily backup still runs, and skips the WhatsApp folder until the volume has a login.

## Run it without Docker

On the server:

```bash
cd /opt/excel-jobs/whatsapp-backup
npm install
npm run build
```

A systemd service, if you use one:

```
[Service]
WorkingDirectory=/opt/excel-jobs/whatsapp-backup
EnvironmentFile=/opt/excel-jobs/whatsapp-backup/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
```

Run **one** copy. Two copies will fight over the same WhatsApp login.

## Environment

| Variable | Why |
| --- | --- |
| `DATA_DIR` | Session, queue, and files waiting to upload. Default `./data`. In Docker, `/data`. |
| `HOST` and `PORT` | Admin page. Default `127.0.0.1` and `8787`. |
| `ADMIN_TOKEN` | Password for that page. Required if `HOST` is not localhost. |
| `TIME_ZONE` | Filing clock. Default `America/Vancouver`. |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | The Drive folder id. |
| `DRIVE_ROOT_NAME` | Name shown on the admin page. Default `WhatsApp Backup`. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Path B. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | Path A. |
| `BACKFILL` | `recent` (default), `full`, or `off`. See below. |
| `BACKFILL_LIMIT` | How many old messages to accept on first login. Default 400. |
| `MAX_ATTEMPTS` | Give up after this many Drive failures. Default 12. The file stays on disk. |
| `MAX_MEDIA_BYTES` | Skip a single file bigger than this. Default 80 MB. |
| `EXCEL_JOBS_PUSH` and the `EXCEL_JOBS_*` variables | Optional copy into Excel Jobs. |
| `WA_DISABLED` | `on` runs the admin page without connecting to WhatsApp. |
| `LOG_LEVEL` | `info` is enough. |
| `WA_LOG_LEVEL` | Leave `silent`. The WhatsApp library is noisy. |

## First start and old messages

The first time the spare phone is linked, WhatsApp sends some recent history to the new linked device. This program saves that history, then asks once for a little more (50 older messages per group), up to `BACKFILL_LIMIT`.

`BACKFILL=full` asks WhatsApp for a deeper history. It uses more memory. It still stops at the limit. Raise `BACKFILL_LIMIT` only if the server has room and you accept a long first run.

`BACKFILL=off` saves only messages that arrive after the link.

WhatsApp decides how much history a new linked device receives. This program cannot promise the old photos already sitting in a group from months ago. On the first day, send a test photo in a group and confirm it appears in Drive.

## Costs

The program itself has no monthly fee.

It runs on the Excel Jobs server. Expect about 200–400 MB of memory while it is connected, and more during a large first history pull. A server with 1 GB total will feel tight once Excel Jobs is also running. 2 GB is the comfortable size for both.

Google Drive is the part that can cost money. A normal Google account includes about 15 GB. Photos are small. Videos and voice notes are the heavy part. When the account is full, uploads stop until you delete files or buy more space from Google. Files already uploaded stay. The admin page shows the Drive error.

There is no per-user fee and no WhatsApp Business API bill, because this does not use that API.

## Risks, in plain words

- **Meta can block the spare number.** This uses WhatsApp Web through a library called Baileys, not a product Meta sells for this purpose. Their rules do not allow unofficial clients. The chance of a block is why this must be a spare number. If it is blocked, backups stop. Scan a new spare number. Photos already in Drive are still there.
- **The library is pinned to Baileys 7.0.0-rc14.** That was the current release of the maintained Baileys project when this was added. It is still marked a release candidate. If login breaks after a WhatsApp change, the usual fix is to update this one package and restart.
- **The session folder is the keys to that WhatsApp.** Anyone who copies `data/session` is logged in as the spare phone. Do not commit it, email it, or leave the server disk world-readable. The daily off-server backup includes that folder, so the remote has to stay private too. The admin QR is the same kind of secret. Keep the page on localhost and use `ADMIN_TOKEN`.
- **Customer houses.** These photos will sit in Google Drive. Google's servers may be outside Canada. Turn this on only if the company is fine with that copy. The server in Canada still holds a file only until Drive accepts it.
- **The spare phone should be turned on now and then.** WhatsApp can log a linked device out if the phone stays offline for a long stretch. If the admin page says logged out, delete the session folder, start the program, and scan the QR again.
- **Read only means read only in the chat.** The program is written so it cannot send a message, a reaction, a "typing" notice, or a read receipt. People in the group should not see a new message from the backup phone. The phone's linked-devices list will show **Excel Backup**. If a photo has expired on WhatsApp's servers, the library may ask the sender's phone to upload that file again so it can be saved. That request is not a message in the group.
- **Do not use the company customer number for this.** If that number is blocked, customers cannot text you.

## What is uncertain

- How far back WhatsApp will share history with a newly linked phone is up to WhatsApp. Plan on recent messages, and check the first day with a real photo.
- This copy was tested with a fake WhatsApp message and a fake Drive, plus a fake Excel Jobs server. It was not logged into a live phone or a live Google account here. The first real QR scan is the moment that proves the login still works with today's WhatsApp.
- Group ids are changing on WhatsApp's side (some chats use `@lid` instead of `@g.us`). The program saves a chat it already knows is a group. A brand new id shape that it has never seen, and that is not in the group list, would be skipped until the library understands it.
- Voice notes and videos are stored in Drive. They are not copied into Excel Jobs, because that app does not accept them yet.

## Commands

```bash
npm test          # filing, duplicates, tags, queue, fake Drive
npm run build     # typecheck and write dist/
npm start         # run the backup and the admin page
npm run demo      # fake messages through the real filing rules
npm run auth      # one-time Google sign-in
npm run status    # print the queue from the data folder
```
