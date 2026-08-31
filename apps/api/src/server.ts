import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { prisma } from "./db.ts";
import { hashPassword, readToken, signToken, verifyPassword } from "./auth.ts";
import {
  buyPlayer, createCareer, httpError, loadWorld, renewContract, sellPlayer, simulateRound, setTactic,
  type Career,
} from "./career.ts";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);
await app.register(rateLimit, { global: false });

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const tacticSchema = z.object({ tactic: z.enum(["offensive", "balanced", "defensive"]) });
const playerIdSchema = z.object({ playerId: z.string().min(1) });
const lineupSchema = z.object({ starterIds: z.array(z.string()).length(11) });

type AuthedReq = { cookies: Record<string, string | undefined> };

function userIdFrom(req: AuthedReq): string {
  const id = readToken(req.cookies.tf);
  if (!id) throw Object.assign(new Error("Não autenticado"), { statusCode: 401 });
  return id;
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
  reply.setCookie("tf", signToken(user.id), { httpOnly: true, path: "/", sameSite: "lax" });
  return { id: user.id, email: user.email, name: user.name };
});

app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
  const body = validate(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
  if (!user || !verifyPassword(body.password, user.passwordHash))
    return reply.code(401).send({ error: "Credenciais inválidas" });
  reply.setCookie("tf", signToken(user.id), { httpOnly: true, path: "/", sameSite: "lax" });
  return { id: user.id, email: user.email, name: user.name };
});

app.post("/auth/logout", async (_req, reply) => {
  reply.clearCookie("tf", { path: "/" });
  return { ok: true };
});

app.get("/me", async (req) => {
  const user = await prisma.user.findUnique({ where: { id: userIdFrom(req) } });
  if (!user) throw httpError("Não autenticado", 401);
  return { id: user.id, email: user.email, name: user.name };
});

app.get("/world", async () => {
  const world = loadWorld();
  return {
    name: world.name,
    seasons: [{ id: "2026", name: "2026" }],
    clubs: world.clubs.map((c) => ({
      id: c.id, name: c.name, city: c.city, colors: c.colors, stadiumName: c.stadiumName, division: c.division,
    })),
  };
});

app.get("/saves", async (req) => {
  const saves = await prisma.save.findMany({ where: { userId: userIdFrom(req) }, orderBy: { updatedAt: "desc" } });
  return saves.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }));
});

app.post("/saves", async (req, reply) => {
  const userId = userIdFrom(req);
  const body = req.body as { clubId?: string; name?: string };
  if (!body.clubId) return reply.code(400).send({ error: "clubId obrigatório" });
  const career = createCareer(body.clubId);
  const save = await prisma.save.create({
    data: { userId, name: body.name ?? career.clubs.find((c) => c.id === body.clubId)?.name ?? "Carreira", payload: JSON.stringify(career) },
  });
  return { id: save.id, name: save.name, career };
});

async function loadSave(req: AuthedReq & { params: { id: string } }) {
  const { id } = req.params;
  const save = await prisma.save.findFirst({ where: { id, userId: userIdFrom(req) } });
  if (!save) throw httpError("Save não encontrado", 404);
  return { save, career: JSON.parse(save.payload) as Career };
}

app.get("/saves/:id", async (req) => {
  const { save, career } = await loadSave(req as never);
  return { id: save.id, name: save.name, career };
});

app.put("/saves/:id/lineup", async (req) => {
  const { save, career } = await loadSave(req as never);
  const { starterIds } = validate(lineupSchema, req.body);
  career.starterIds = starterIds;
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

app.post("/saves/:id/inbox/:msgId/read", async (req, reply) => {
  const { save, career } = await loadSave(req as never);
  const { msgId } = req.params as { msgId: string };
  const msg = career.inbox.find((m) => m.id === msgId);
  if (!msg) return reply.code(404).send({ error: "Mensagem não encontrada" });
  msg.read = true;
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
  return { inbox: career.inbox };
});

const port = Number(process.env.PORT ?? 3333);
await app.listen({ port, host: "0.0.0.0" });