import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function enableSqliteWal(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return;
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
  await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000");
}
