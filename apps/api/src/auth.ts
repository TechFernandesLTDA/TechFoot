import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SESSION_SECRET ?? "techfoot-dev-secret-change-me";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64);
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== check.length) return false;
  return timingSafeEqual(actual, check);
}

export function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 7 * 86400000 })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId: string; exp: number };
  if (data.exp < Date.now()) return null;
  return data.userId;
}
