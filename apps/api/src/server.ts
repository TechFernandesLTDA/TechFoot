import { pathToFileURL } from "node:url";
import Fastify, { type FastifyError, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { enableSqliteWal, prisma } from "./db.ts";
import { hashPassword, readToken, signToken, verifyPassword } from "./auth.ts";
import {
  buyPlayer, createCareer, httpError, loadWorld, renewContract, sellPlayer, simulateRound, setTactic, takeLoan,
  updateAdmin, normalizeCareer, setMatchPlan,
  type Career,
} from "./career.ts";
import { publicSupportStatus, verifyPaymentSignature } from "./support.ts";
import { assertReadyToListen, loadLocalEnv, sessionCookie, startupIssues, trustProxyOption } from "./config.ts";

const newPasswordSchema = z.string().min(8, "precisa ter entre 8 e 128 caracteres").max(128, "precisa ter entre 8 e 128 caracteres");

export async function buildApp() {
const trustProxy = trustProxyOption();
const app = Fastify({ logger: process.env.NODE_ENV === "test" ? false : true, trustProxy });
const loginFailures = new Map<string, { fails: number; until: number }>();
const LOGIN_FAILS_BEFORE_BACKOFF = 5;
function loginBackoffMs(fails: number): number {
  const over = Math.max(0, fails - LOGIN_FAILS_BEFORE_BACKOFF);
  return Math.min(15 * 60_000, 60_000 * 2 ** over);
}
function assertLoginAllowed(email: string): void {
  const row = loginFailures.get(email);
  if (!row || row.until <= Date.now()) return;
  const seconds = Math.max(1, Math.ceil((row.until - Date.now()) / 1000));
  throw httpError(`Muitas tentativas para este e-mail. Tente de novo em ${seconds}s.`, 429);
}
function recordLoginFailure(email: string): void {
  const row = loginFailures.get(email) ?? { fails: 0, until: 0 };
  row.fails += 1;
  if (row.fails >= LOGIN_FAILS_BEFORE_BACKOFF) row.until = Date.now() + loginBackoffMs(row.fails);
  loginFailures.set(email, row);
}
function clearLoginFailure(email: string): void {
  loginFailures.delete(email);
}
function clearSession(reply: { clearCookie: (name: string, options: { path: string; sameSite: "lax"; secure: boolean }) => void }): void {
  reply.clearCookie("tf", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}
await app.register(cors, { origin: process.env.WEB_ORIGIN ?? true, credentials: true });
await app.register(cookie);
await app.register(rateLimit, { global: false });

app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  const raw = typeof body === "string" ? body : body.toString("utf8");
  (req as FastifyRequest & { rawBody?: string }).rawBody = raw;
  if (!raw) {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(raw));
  } catch {
    done(httpError("JSON inválido", 400), undefined);
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: newPasswordSchema,
  name: z.string().min(1).max(80),
  acceptTerms: z.boolean().refine((value) => value, { message: "é preciso aceitar os termos" }),
  age18: z.boolean().refine((value) => value, { message: "é preciso declarar 18 anos ou mais" }),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  nextPassword: newPasswordSchema,
});
const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });
const tacticSchema = z.object({ tactic: z.enum(["offensive", "balanced", "defensive"]) });
const playerIdSchema = z.object({ playerId: z.string().min(1) });
const matchPlanSchema = z.object({
  starterIds: z.array(z.string()).length(11),
  benchIds: z.array(z.string()).max(5).optional(),
  formation: z.enum(["4-3-3", "4-4-2", "3-5-2", "5-3-2", "4-2-3-1"]).optional(),
  captainId: z.string().min(1).optional(),
  substitutions: z.array(z.object({ minute: z.number().int().min(46).max(89), playerOutId: z.string().min(1), playerInId: z.string().min(1) })).max(5).optional(),
});
const adminSchema = z.object({
  ticketPrice: z.number().optional(),
  membershipFee: z.number().optional(),
  sponsorTier: z.number().optional(),
  broadcastTier: z.number().optional(),
  merchandisePrice: z.number().optional(),
  stadiumLevel: z.number().optional(),
  maintenanceBudget: z.number().optional(),
  youthBudget: z.number().optional(),
  scoutingBudget: z.number().optional(),
});
const loanSchema = z.object({ amount: z.number().int().positive() });
const saveSchema = z.object({ clubId: z.string().min(1), name: z.string().trim().min(1).max(80).optional() });
const supportIntentSchema = z.object({
  amountCents: z.number().int().min(100).max(10_000_000).nullish(),
  note: z.string().trim().max(140).nullish(),
});
const webhookSchema = z.object({ intentId: z.string().min(1) });

type AuthedReq = { cookies: Record<string, string | undefined> };

async function userIdFrom(req: AuthedReq): Promise<string> {
  const session = readToken(req.cookies.tf);
  if (!session) throw httpError("Não autenticado", 401);
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
  if (!user || user.sessionVersion !== session.sv) throw httpError("Não autenticado", 401);
  return session.userId;
}

app.setErrorHandler((err: FastifyError, req, reply) => {
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === "P2002") return reply.code(409).send({ error: "E-mail já cadastrado" });
  if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
  req.log.error(err);
  return reply.code(500).send({ error: "Erro interno" });
});

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw httpError(first ? `${first.path.join(".") || "campo"} ${first.message}` : "Validação falhou", 400);
  }
  return parsed.data;
}

app.post("/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
  const body = validate(registerSchema, req.body);
  const user = await prisma.user.create({
    data: { email: body.email.toLowerCase().trim(), name: body.name.trim(), passwordHash: hashPassword(body.password) },
  });
  reply.setCookie("tf", signToken(user.id, user.sessionVersion), sessionCookie());
  return { id: user.id, email: user.email, name: user.name };
});

app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
  const body = validate(loginSchema, req.body);
  const email = body.email.toLowerCase().trim();
  assertLoginAllowed(email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    recordLoginFailure(email);
    return reply.code(401).send({ error: "Credenciais inválidas" });
  }
  clearLoginFailure(email);
  reply.setCookie("tf", signToken(user.id, user.sessionVersion), sessionCookie());
  return { id: user.id, email: user.email, name: user.name };
});

app.post("/auth/logout", async (req, reply) => {
  const session = readToken(req.cookies.tf);
  if (session) {
    await prisma.user.updateMany({
      where: { id: session.userId, sessionVersion: session.sv },
      data: { sessionVersion: { increment: 1 } },
    });
  }
  clearSession(reply);
  return { ok: true };
});

app.get("/me", async (req) => {
  const user = await prisma.user.findUnique({ where: { id: await userIdFrom(req) } });
  if (!user) throw httpError("Não autenticado", 401);
  return { id: user.id, email: user.email, name: user.name };
});

app.get("/me/export", async (req) => {
  const userId = await userIdFrom(req);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { saves: true, supportIntents: true } });
  if (!user) throw httpError("Não autenticado", 401);
  return {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone, createdAt: user.createdAt.toISOString() },
    saves: user.saves.map((save) => ({
      id: save.id,
      name: save.name,
      active: save.active,
      createdAt: save.createdAt.toISOString(),
      updatedAt: save.updatedAt.toISOString(),
      career: careerPayload(save.payload),
    })),
    supportIntents: user.supportIntents.map(serializeIntent),
  };
});

app.post("/me/password", async (req, reply) => {
  const userId = await userIdFrom(req);
  const body = validate(passwordChangeSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) return reply.code(401).send({ error: "Senha atual incorreta" });
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(body.nextPassword), sessionVersion: { increment: 1 } },
  });
  clearSession(reply);
  return { ok: true };
});

app.delete("/me", async (req, reply) => {
  const userId = await userIdFrom(req);
  const body = validate(deleteAccountSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !verifyPassword(body.password, user.passwordHash)) return reply.code(401).send({ error: "Senha incorreta" });
  await prisma.user.delete({ where: { id: userId } });
  clearSession(reply);
  return { ok: true };
});

async function databaseUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

app.get("/health", async (_req, reply) => {
  if (!(await databaseUp())) return reply.code(503).send({ ok: false, db: "down" });
  return { ok: true, db: "up" };
});

app.get("/health/detail", async (_req, reply) => {
  if (process.env.NODE_ENV === "production") return reply.code(404).send({ error: "Não encontrado" });
  if (!(await databaseUp())) return reply.code(503).send({ ok: false, db: "down" });
  const support = publicSupportStatus();
  return {
    ok: true,
    service: "techfoot-api",
    db: "up",
    payments: { providerConfigured: support.providerConfigured, pixBrCode: support.brCodeAvailable, premiumCheckout: "unavailable" as const },
    configWarnings: startupIssues().filter((issue) => issue.level === "warning").map((issue) => issue.message),
  };
});

app.get("/support", async () => publicSupportStatus());

app.get("/support/intents", async (req) => {
  const intents = await prisma.supportIntent.findMany({ where: { userId: await userIdFrom(req) }, orderBy: { createdAt: "desc" } });
  return { intents: intents.map(serializeIntent), confirmed: false, unlocked: false };
});

app.post("/support/intents", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
  const body = validate(supportIntentSchema, req.body ?? {});
  const created = await prisma.supportIntent.create({
    data: {
      userId: await userIdFrom(req),
      amountCents: body.amountCents ?? null,
      note: body.note?.trim() ? body.note.trim() : null,
      status: "unverified",
    },
  });
  return { intent: serializeIntent(created), confirmed: false, unlocked: false };
});

app.post("/support/webhooks/payment", async (req, reply) => {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) return reply.code(503).send({ error: "Provedor de pagamento não configurado. Nenhum pagamento foi confirmado.", configured: false, unlocked: false });
  const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? "";
  const signature = req.headers["x-techfoot-signature"];
  if (!verifyPaymentSignature(raw, Array.isArray(signature) ? signature[0] : signature, secret)) {
    return reply.code(401).send({ error: "Assinatura inválida. Pagamento não confirmado.", unlocked: false });
  }
  const body = validate(webhookSchema, req.body);
  const intent = await prisma.supportIntent.findUnique({ where: { id: body.intentId } });
  if (!intent) return reply.code(404).send({ error: "Intenção não encontrada", unlocked: false });
  if (intent.status !== "verified") {
    await prisma.supportIntent.update({ where: { id: intent.id }, data: { status: "verified" } });
  }
  return {
    status: "verified",
    unlocked: false,
    message: "O provedor confirmou esta intenção. Nenhum recurso do jogo foi liberado.",
  };
});

function careerPayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function serializeIntent(intent: { id: string; amountCents: number | null; note: string | null; status: string; createdAt: Date }) {
  return {
    id: intent.id,
    amountCents: intent.amountCents,
    note: intent.note,
    status: intent.status === "verified" ? "verified" as const : "unverified" as const,
    createdAt: intent.createdAt.toISOString(),
    unlocksFeatures: false as const,
  };
}

app.get("/world", async () => {
  const world = loadWorld();
  return {
    name: world.name,
    seasons: [{ id: "2026", name: "2026" }],
    stats: {
      clubs: world.clubs.length,
      divisions: new Set(world.clubs.map((club) => club.division)).size,
      players: world.clubs.reduce((total, club) => total + club.players.length, 0),
      stateCompetitions: world.stateCompetitions.length,
    },
    stateCompetitions: world.stateCompetitions,
    clubs: world.clubs.map((c) => ({
      id: c.id, name: c.name, city: c.city, state: c.state, colors: c.colors, stadiumName: c.stadiumName, division: c.division,
    })),
  };
});

app.get("/competitions", async () => {
  const world = loadWorld();
  return {
    season: 2026,
    competitions: [
      { id: "brasileirao-a", name: "Campeonato Brasileiro Série A", format: "38 rodadas · ida e volta", clubs: 20 },
      { id: "brasileirao-b", name: "Campeonato Brasileiro Série B", format: "38 rodadas · playoff de acesso", clubs: 20 },
      { id: "brasileirao-c", name: "Campeonato Brasileiro Série C", format: "fase única + quadrangular", clubs: 20 },
      { id: "copa-do-brasil", name: "Copa do Brasil", format: "126 clubes · sorteio por fases", clubs: 126 },
      ...world.stateCompetitions.map((competition) => ({ id: competition.id, name: competition.name, format: "formato estadual configurável", clubs: world.clubs.filter((club) => club.state === competition.state).length })),
    ],
  };
});

app.get("/saves", async (req) => {
  const saves = await prisma.save.findMany({ where: { userId: await userIdFrom(req) }, orderBy: { updatedAt: "desc" } });
  return saves.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }));
});

app.post("/saves", async (req, reply) => {
  const userId = await userIdFrom(req);
  const body = validate(saveSchema, req.body);
  const activeSave = await prisma.save.findFirst({ where: { userId, active: true }, select: { id: true } });
  if (activeSave) return reply.code(409).send({ error: "Sua carreira já está vinculada a um clube" });
  const career = createCareer(body.clubId);
  const save = await prisma.save.create({
    data: { userId, name: body.name ?? career.clubs.find((c) => c.id === body.clubId)?.name ?? "Carreira", payload: JSON.stringify(career) },
  });
  return { id: save.id, name: save.name, career };
});

async function loadSave(req: AuthedReq & { params: { id: string } }) {
  const { id } = req.params;
  const save = await prisma.save.findFirst({ where: { id, userId: await userIdFrom(req) } });
  if (!save) throw httpError("Save não encontrado", 404);
  return { save, career: normalizeCareer(JSON.parse(save.payload) as Career) };
}

app.get("/saves/:id", async (req) => {
  const { save, career } = await loadSave(req as never);
  return { id: save.id, name: save.name, career };
});

app.put("/saves/:id/lineup", async (req) => {
  const { save, career } = await loadSave(req as never);
  const plan = validate(matchPlanSchema, req.body);
  setMatchPlan(career, plan);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
  return { career };
});

app.put("/saves/:id/tactic", async (req) => {
  const { save, career } = await loadSave(req as never);
  const { tactic } = validate(tacticSchema, req.body);
  const updated = setTactic(career, tactic);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(updated) } });
  return { career: updated };
});

app.put("/saves/:id/admin", async (req) => {
  const { save, career } = await loadSave(req as never);
  const patch = validate(adminSchema, req.body);
  const updated = updateAdmin(career, patch);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(updated) } });
  return { career: updated };
});

app.post("/saves/:id/admin/loan", async (req) => {
  const { save, career } = await loadSave(req as never);
  const { amount } = validate(loanSchema, req.body);
  const updated = takeLoan(career, amount);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(updated) } });
  return { career: updated };
});

app.post("/saves/:id/simulate-round", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
  const { save, career } = await loadSave(req as never);
  const { career: next, userMatch } = simulateRound(career);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(next) } });
  return { career: next, userMatch };
});

app.post("/saves/:id/market/buy", async (req) => {
  const { save, career } = await loadSave(req as never);
  const { playerId } = validate(playerIdSchema, req.body);
  const updated = buyPlayer(career, playerId);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(updated) } });
  return { career: updated };
});

app.post("/saves/:id/market/sell", async (req) => {
  const { save, career } = await loadSave(req as never);
  const { playerId } = validate(playerIdSchema, req.body);
  const updated = sellPlayer(career, playerId);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(updated) } });
  return { career: updated };
});

app.post("/saves/:id/renew", async (req) => {
  const { save, career } = await loadSave(req as never);
  const { playerId } = validate(playerIdSchema, req.body);
  const { career: updated } = renewContract(career, playerId);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(updated) } });
  return { career: updated };
});

app.post("/saves/:id/inbox/read-all", async (req) => {
  const { save, career } = await loadSave(req as never);
  for (const message of career.inbox) message.read = true;
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
  return { inbox: career.inbox };
});

app.post("/saves/:id/inbox/:msgId/read", async (req, reply) => {
  const { save, career } = await loadSave(req as never);
  const { msgId } = req.params as { msgId: string };
  const msg = career.inbox.find((m) => m.id === msgId);
  if (!msg) return reply.code(404).send({ error: "Mensagem não encontrada" });
  msg.read = true;
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
  return { inbox: career.inbox };
});

  return app;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  loadLocalEnv();
  assertReadyToListen();
  await enableSqliteWal();
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3333);
  await app.listen({ port, host: "0.0.0.0" });
}
