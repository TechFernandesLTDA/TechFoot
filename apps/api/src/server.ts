import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { prisma } from "./db.ts";
import { hashPassword, readToken, signToken, verifyPassword } from "./auth.ts";
import { createCareer, loadWorld, simulateRound, type Career } from "./career.ts";
import { defaultStarters } from "@techfoot/engine";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);

function userIdFrom(req: { cookies: Record<string, string | undefined> }): string {
  const id = readToken(req.cookies.tf);
  if (!id) throw Object.assign(new Error("Não autenticado"), { statusCode: 401 });
  return id;
}

app.setErrorHandler((err: FastifyError, req, reply) => {
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === "P2002") {
    return reply.code(409).send({ error: "E-mail já cadastrado" });
  }
  if (err.statusCode && err.statusCode < 500) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  req.log.error(err);
  return reply.code(500).send({ error: "Erro interno" });
});

app.post("/auth/register", async (req, reply) => {
  const body = req.body as { email?: string; password?: string; name?: string };
  if (!body.email || !body.password || !body.name) {
    return reply.code(400).send({ error: "email, password e name são obrigatórios" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return reply.code(400).send({ error: "E-mail inválido" });
  }
  if (body.password.length < 6) {
    return reply.code(400).send({ error: "Senha precisa de no mínimo 6 caracteres" });
  }
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase().trim(),
      name: body.name.trim(),
      passwordHash: hashPassword(body.password),
    },
  });
  reply.setCookie("tf", signToken(user.id), { httpOnly: true, path: "/", sameSite: "lax" });
  return { id: user.id, email: user.email, name: user.name };
});

app.post("/auth/login", async (req, reply) => {
  const body = req.body as { email?: string; password?: string };
  const user = await prisma.user.findUnique({ where: { email: (body.email ?? "").toLowerCase().trim() } });
  if (!user || !verifyPassword(body.password ?? "", user.passwordHash)) {
    return reply.code(401).send({ error: "Credenciais inválidas" });
  }
  reply.setCookie("tf", signToken(user.id), { httpOnly: true, path: "/", sameSite: "lax" });
  return { id: user.id, email: user.email, name: user.name };
});

app.post("/auth/logout", async (_req, reply) => {
  reply.clearCookie("tf", { path: "/" });
  return { ok: true };
});

app.get("/me", async (req) => {
  const user = await prisma.user.findUnique({ where: { id: userIdFrom(req) } });
  if (!user) throw Object.assign(new Error("Não autenticado"), { statusCode: 401 });
  return { id: user.id, email: user.email, name: user.name };
});

app.get("/world", async () => {
  const world = loadWorld();
  return {
    name: world.name,
    clubs: world.clubs.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      colors: c.colors,
      stadiumName: c.stadiumName,
    })),
  };
});

app.get("/saves", async (req) => {
  const saves = await prisma.save.findMany({
    where: { userId: userIdFrom(req) },
    orderBy: { updatedAt: "desc" },
  });
  return saves.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }));
});

app.post("/saves", async (req, reply) => {
  const userId = userIdFrom(req);
  const body = req.body as { clubId?: string; name?: string };
  if (!body.clubId) return reply.code(400).send({ error: "clubId obrigatório" });
  const career = createCareer(body.clubId);
  const save = await prisma.save.create({
    data: {
      userId,
      name: body.name ?? career.clubs.find((c) => c.id === body.clubId)?.name ?? "Carreira",
      payload: JSON.stringify(career),
    },
  });
  return { id: save.id, name: save.name, career };
});

app.get("/saves/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const save = await prisma.save.findFirst({ where: { id, userId: userIdFrom(req) } });
  if (!save) return reply.code(404).send({ error: "Save não encontrado" });
  return { id: save.id, name: save.name, career: JSON.parse(save.payload) as Career };
});

app.put("/saves/:id/lineup", async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { starterIds?: string[] };
  const save = await prisma.save.findFirst({ where: { id, userId: userIdFrom(req) } });
  if (!save) return reply.code(404).send({ error: "Save não encontrado" });
  const career = JSON.parse(save.payload) as Career;
  const ids = body.starterIds ?? defaultStarters(career.clubs.find((c) => c.id === career.clubId)?.players ?? []);
  if (ids.length !== 11) return reply.code(400).send({ error: "Escalação precisa de 11 jogadores" });
  career.starterIds = ids;
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
  return { career };
});

app.post("/saves/:id/simulate-round", async (req, reply) => {
  const { id } = req.params as { id: string };
  const save = await prisma.save.findFirst({ where: { id, userId: userIdFrom(req) } });
  if (!save) return reply.code(404).send({ error: "Save não encontrado" });
  const current = JSON.parse(save.payload) as Career;
  const { career, userMatch } = simulateRound(current);
  await prisma.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
  return { career, userMatch };
});

const port = Number(process.env.PORT ?? 3333);
await app.listen({ port, host: "0.0.0.0" });
