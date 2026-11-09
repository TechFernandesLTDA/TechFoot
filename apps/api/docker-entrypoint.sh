#!/bin/sh
set -eu
cd /app
npx prisma db push --schema apps/api/prisma/schema.prisma --skip-generate
exec npx tsx apps/api/src/server.ts
