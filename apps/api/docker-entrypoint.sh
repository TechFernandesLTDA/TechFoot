#!/bin/sh
set -eu
cd /app
# env_file é o caminho principal. SESSION_SECRET_FILE só entra se o processo
# conseguir ler o arquivo; o secret do host é root 0400 e o uid 10001 não o abre.
if [ -z "${SESSION_SECRET:-}" ] && [ -n "${SESSION_SECRET_FILE:-}" ] && [ -r "${SESSION_SECRET_FILE}" ]; then
  SESSION_SECRET=$(tr -d '\r\n' < "$SESSION_SECRET_FILE")
  export SESSION_SECRET
fi
if [ -z "${SESSION_SECRET:-}" ] && [ -r /run/secrets/session_secret ]; then
  SESSION_SECRET=$(tr -d '\r\n' < /run/secrets/session_secret)
  export SESSION_SECRET
fi
# db push adds sessionVersion (default 0) on an existing SQLite file.
# Do not switch this database to `migrate deploy` without a baseline.
npx prisma db push --schema apps/api/prisma/schema.prisma --skip-generate
exec node --experimental-strip-types apps/api/src/server.ts
