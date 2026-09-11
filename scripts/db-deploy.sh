#!/bin/sh
# Apply migrations to the LOCAL CLONE. Never production.
#
# `npx prisma migrate deploy` reads .env — which holds the company's real
# database — so typing it by hand migrates production by accident. That
# happened on 2026-09-08. Use this instead; to touch production, do it
# deliberately through records/plans/apply-to-prod.md.
#
# Optional: another database on the same local server, for a rig that needs an
# empty one (2026-09-11):   sh scripts/db-deploy.sh orbit_firstrun
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$DIR/.env.local" ]; then
  echo "No .env.local — refusing to run, because plain prisma would hit production." >&2
  exit 1
fi
URL=$(grep '^DATABASE_URL=' "$DIR/.env.local" | cut -d= -f2- | tr -d '"')
DIRECT=$(grep '^DATABASE_URL_UNPOOLED=' "$DIR/.env.local" | cut -d= -f2- | tr -d '"')
if [ -n "$1" ]; then
  case "$1" in
    *[!a-z0-9_]*) echo "A database name is lower-case letters, digits and _ only." >&2; exit 1 ;;
  esac
  URL=$(printf '%s' "$URL" | sed "s#/orbit_clone#/$1#")
  DIRECT=$(printf '%s' "$DIRECT" | sed "s#/orbit_clone#/$1#")
fi
case "$URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "DATABASE_URL in .env.local is not the local clone ($URL). Refusing." >&2; exit 1 ;;
esac
case "$DIRECT" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "DATABASE_URL_UNPOOLED in .env.local is not the local clone. Refusing." >&2; exit 1 ;;
esac
echo "Migrating a local database: $(printf '%s' "$URL" | sed -E 's#//[^@]*@#//***@#')"
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$DIRECT" npx prisma migrate deploy
