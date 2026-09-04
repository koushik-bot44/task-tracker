# Hosting on Vercel — environment variables and the deploy order

Repo: https://github.com/koushik-bot44/task-tracker (main). Vercel → Add New
Project → import that repo. Root Directory is the repo root; the defaults are
right (`npm run build`). Everything below goes in **Settings → Environment
Variables → Production** before the first deploy.

> **The first deploy migrates the production database.** The build script is
> `prisma migrate deploy && next build`, so the moment Vercel builds with the
> real `DATABASE_URL`, the restructure migrations (milestones, four statuses,
> comments, `progressManual`, `logoUrl`, …) run on prod. That is "apply to
> prod". Do the backup steps in `records/plans/apply-to-prod.md` FIRST —
> dump + integrity snapshot — and only then deploy.

## Variables

| name | value | needed for |
|---|---|---|
| `DATABASE_URL` | the pooled Neon string (the one in the local `.env`) | the app |
| `DATABASE_URL_UNPOOLED` | the direct Neon string (also in `.env`) | migrations at build time |
| `AUTH_SECRET` | copy from the local `.env` — keep it the SAME so existing logins survive | sessions, reply links |
| `CRON_SECRET` | a fresh random string: run `openssl rand -base64 32` | the 18:00 IST "tomorrow" message and the snooze cron (Vercel sends it as the Bearer token automatically) |
| `APP_URL` | `https://<your-app>.vercel.app` (or the custom domain) | links in email/WhatsApp/push |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | copy from the local `.env` (same keys, or existing push subscriptions die) | push |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Create → Blob → connect to the project (it injects this) | project logos, photos/PDFs on notes — the camera, paper-clip and "Upload a logo" hide without it |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (optional `SMTP_SECURE`, `EMAIL_REPLY_TO`) | from your mail provider | email; silent while unset |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_CONTENT_SID` | from Twilio | WhatsApp; silent while unset |

Not needed: `APP_PASSCODE` (only the long-closed first-run bootstrap reads it —
leave it unset), the `SHOT_*` logins (screenshot rig, dev only),
`NODE_ENV`/`VERCEL_URL` (Vercel sets them).

## Order

1. Backup prod (runbook §1–2: dump + integrity snapshot).
2. Set the variables above; create the Blob store.
3. Deploy. The build runs the migrations, then compiles.
4. Make the real CEO: `npx tsx scripts/promote-founder.ts <the CEO's email>`
   against prod (see the runbook), then point every `Person.managerId` at the
   CEO — Well Being is the CEO's alone.
5. Smoke: log in, Projects → a department → a project; add a task; the
   calendar shows the review meetings; `GET /api/cron/tomorrow` with the
   Bearer secret answers `{ok}`.
6. Tag the deploy (`prod-restructure-1`) — never move a pushed tag.

The two crons in `vercel.json` (`30 12 * * *` = 18:00 IST, and hourly
snooze-wake) start on their own once `CRON_SECRET` is set.
