#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then echo 'Usage: scripts/db/restore.sh source.dump (replaces the server database)' >&2; exit 1; fi
# Stop application writes before invoking. Create a fresh backup first.
docker compose --env-file .env.production -f compose.server.yaml exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1"
