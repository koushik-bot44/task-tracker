#!/bin/sh
# The local clone database (PostgreSQL 18, data in .localdb/pgdata, port 5433).
# `npm run dev` reads .env.local, which points at this database — start it first.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PG="$DIR/.localdb/bin/bin"
DATA="$DIR/.localdb/pgdata"
LOG="$DIR/.localdb/pg.log"

if [ ! -x "$PG/pg_ctl" ]; then
  echo "PostgreSQL binaries missing at .localdb/bin — see records/plans (dev setup)." >&2
  exit 1
fi

case "$1" in
  start)
    "$PG/pg_ctl" -D "$DATA" -l "$LOG" -o "-p 5433 -c unix_socket_directories=''" start
    ;;
  stop)
    "$PG/pg_ctl" -D "$DATA" stop
    ;;
  status)
    "$PG/pg_ctl" -D "$DATA" status
    ;;
  *)
    echo "usage: scripts/db.sh start|stop|status" >&2
    exit 1
    ;;
esac
