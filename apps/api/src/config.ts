import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEV_SESSION_SECRETS = new Set([
  "change-me",
  "troque-por-um-segredo-longo-em-producao",
  "techfoot-dev-secret-change-me",
  "SUBSTITUA-POR-UM-SEGREDO-EXCLUSIVO",
]);

export type StartupIssue = { level: "fatal" | "warning"; message: string };

export function startupIssues(env: NodeJS.ProcessEnv = process.env): StartupIssue[] {
  const issues: StartupIssue[] = [];
  const production = env.NODE_ENV === "production";
  if (!env.DATABASE_URL?.trim()) issues.push({ level: "fatal", message: "DATABASE_URL é obrigatório" });
  const secret = env.SESSION_SECRET?.trim() ?? "";
  if (production && (secret.length < 24 || DEV_SESSION_SECRETS.has(secret))) {
    issues.push({ level: "fatal", message: "SESSION_SECRET de produção precisa ser exclusivo e ter pelo menos 24 caracteres" });
  }
  if (production && !env.WEB_ORIGIN?.trim()) {
    issues.push({ level: "fatal", message: "WEB_ORIGIN deve ser a origem pública do site" });
  }
  const merchantName = Boolean(env.PIX_MERCHANT_NAME?.trim());
  const merchantCity = Boolean(env.PIX_MERCHANT_CITY?.trim());
  if (merchantName !== merchantCity) {
    issues.push({
      level: production ? "fatal" : "warning",
      message: "PIX_MERCHANT_NAME e PIX_MERCHANT_CITY precisam ser configurados juntos. Nenhum BR Code é gerado pela metade.",
    });
  }
  return issues;
}

export function assertReadyToListen(env: NodeJS.ProcessEnv = process.env): void {
  const fatal = startupIssues(env).filter((issue) => issue.level === "fatal");
  if (fatal.length === 0) return;
  const message = fatal.map((issue) => issue.message).join(" ");
  console.error(message);
  throw new Error(message);
}

export function loadLocalEnv(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (!existsSync(envPath)) return;
  process.loadEnvFile(envPath);
}

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

const PROXY_HOPS = 2;

export function isTrustedProxyAddress(address: string): boolean {
  const raw = address.trim().toLowerCase();
  const ip = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  if (ip === "::1") return true;
  if (ip.includes(":")) return ip.startsWith("fc") || ip.startsWith("fd");
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function trustProxyOption(env: NodeJS.ProcessEnv = process.env): boolean | ((address: string, hop: number) => boolean) {
  const raw = env.TRUST_PROXY?.trim().toLowerCase();
  const enabled = raw === "true" || raw === "2" || (raw !== "false" && env.NODE_ENV === "production");
  if (!enabled) return false;
  return (address, hop) => hop < PROXY_HOPS && isTrustedProxyAddress(address);
}

export function sessionCookie(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true as const,
    path: "/",
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
