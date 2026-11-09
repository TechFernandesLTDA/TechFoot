import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SESSION_MAX_AGE_MS } from "./config.ts";

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? "techfoot-dev-secret-change-me";
}

export type SessionToken = { userId: string; sv: number };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const check = scryptSync(password, salt, 64);
    const actual = Buffer.from(hash, "hex");
    if (actual.length !== check.length) return false;
    return timingSafeEqual(actual, check);
  } catch {
    return false;
  }
}

export function signToken(userId: string, sessionVersion = 0): string {
  const payload = Buffer.from(JSON.stringify({ userId, sv: sessionVersion, exp: Date.now() + SESSION_MAX_AGE_MS })).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readToken(token: string | undefined): SessionToken | null {
  try {
    if (!token) return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId?: string; sv?: number; exp?: number };
    if (!data.userId || !data.exp || data.exp < Date.now()) return null;
    const sv = data.sv === undefined ? 0 : data.sv;
    if (!Number.isInteger(sv) || sv < 0) return null;
    return { userId: data.userId, sv };
  } catch {
    return null;
  }
}
