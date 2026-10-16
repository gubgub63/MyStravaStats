#!/bin/sh
set -eu
umask 077
if [ "$#" -ne 1 ]; then echo 'Usage: scripts/db/backup.sh destination.dump' >&2; exit 1; fi
set -C
# Refuse to overwrite an existing backup.
docker compose --env-file .env.production -f compose.server.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$1"
echo "Backup saved: $1"
