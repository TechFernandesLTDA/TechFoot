-- Additive change for a SQLite database that already has users.
-- Existing rows receive 0. Tokens issued before this column omit `sv`
-- and are treated as sessionVersion 0 until logout or a password change.
-- Production startup applies this with `prisma db push`, which is idempotent.
-- Do not point `prisma migrate deploy` at a database that was only ever
-- created with `db push` unless `_prisma_migrations` has been baselined.

ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
