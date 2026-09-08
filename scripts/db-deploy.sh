#!/bin/sh
# Apply migrations to the LOCAL CLONE. Never production.
#
# `npx prisma migrate deploy` reads .env — which holds the company's real
# database — so typing it by hand migrates production by accident. That
# happened on 2026-09-08. Use this instead; to touch production, do it
# deliberately through records/plans/apply-to-prod.md.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$DIR/.env.local" ]; then
  echo "No .env.local — refusing to run, because plain prisma would hit production." >&2
  exit 1
fi
URL=$(grep '^DATABASE_URL=' "$DIR/.env.local" | cut -d= -f2- | tr -d '"')
DIRECT=$(grep '^DATABASE_URL_UNPOOLED=' "$DIR/.env.local" | cut -d= -f2- | tr -d '"')
case "$URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "DATABASE_URL in .env.local is not the local clone ($URL). Refusing." >&2; exit 1 ;;
esac
echo "Migrating the local clone: $URL"
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$DIRECT" npx prisma migrate deploy
