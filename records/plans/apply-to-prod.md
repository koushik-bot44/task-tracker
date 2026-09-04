# Apply the restructure to production — runbook (only on the owner's word)

Nothing below runs until the owner says "apply to prod" and names the FOUNDER
account. Every step is copy-pasteable from the repo root; `.env` holds the
production Neon URLs, `.env.local` the local clone.

## 0. Preconditions
- `git status` clean; landings L1–L3 tagged; `records/defects.md` has no open row.
- The owner has named the founder's email: `FOUNDER_EMAIL=...`.
- Vercel env has `CRON_SECRET`, `AUTH_SECRET`, SMTP_*, TWILIO_*, VAPID_*, and (for photos/files) `BLOB_READ_WRITE_TOKEN`.

## 1. Dump + integrity BEFORE (prod, read-only)
```
npx tsx --env-file=.env scripts/backup-database.ts ~/orbit-backups/prod-before-restructure-$(date -u +%Y%m%dT%H%M%SZ).json
npx tsx --env-file=.env scripts/restructure-dump.ts          # records/snapshots/restructure-dump-<stamp>/ (passwordHash redacted)
npx tsx --env-file=.env scripts/integrity.ts prod-before-restructure
npx tsx --env-file=.env scripts/restructure-dryrun.ts        # BEGIN…ROLLBACK on prod: prints the audit, persists nothing
```
Read the dry-run audit: expected on prod = 16 users (placement: owner/lead/members of the 4 Development projects placed, the rest "Not placed yet"), tasks TODO/DOING/DONE, 6 important, 1 archived, 3 comments (1 task note + 2 project notes; +1 if the single described task is a project task), 0 canManage, 0 milestones, 0 replies.

## 2. Migrate (prod, one transaction)
```
npx prisma migrate deploy      # reads .env → applies 20260903190000_phase48_org_hierarchy (if pending) + 20260904120000_restructure
npx tsx --env-file=.env scripts/restructure-dryrun.ts --audit-only > records/snapshots/restructure-audit-prod-$(date -u +%Y-%m-%dT%H-%M-%S).json
npx tsx --env-file=.env scripts/integrity.ts prod-after-restructure
```
Both integrity hashes will differ from "before" by design (statuses renamed); the task COUNT must match the before line exactly.

## 3. Promote the founder
```
npx tsx --env-file=.env scripts/promote-founder.ts $FOUNDER_EMAIL
```

## 4. Deploy
Push `main` (Vercel builds with `prisma migrate deploy && next build`, which is now a no-op for the migration). Confirm `vercel.json` crons show `/api/cron/tomorrow` at `30 12 * * *`.

## 5. Smoke on prod (as the founder)
- F1: New project → + Add milestone → + Give a task (3 taps) → the person sees it on Today with a bell row (and email/WhatsApp when configured) → they tick it → founder sets 25% from the header.
- One (b): `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/tomorrow` at any time → `{ok:true, people:N}`; the founder's bell shows "Tomorrow: …" only if they have something tomorrow.

## 6. Tag
```
git tag restructure-prod-applied && git push --tags
```
Append the prod integrity lines to `records/integrity-ledger.txt` (the script already does) and note the founder promotion in `records/verdicts/restructure-l3.md`.

## Rollback
The migration drops columns and tables only after copying their rows into the
new shapes; the JSON backup from step 1 is the way back. Restore = recreate the
database from the backup with `scripts/backup-database.ts`'s output (manual),
then redeploy the `baseline-phase49b` tag.
