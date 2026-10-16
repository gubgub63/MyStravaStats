#!/bin/sh
set -eu
if [ -n "${DATABASE_URL:-}" ]; then node scripts/db/migrate.mjs; fi
exec node server.js
