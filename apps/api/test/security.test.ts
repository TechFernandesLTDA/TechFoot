import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { readToken } from "../src/auth.ts";
import { prisma } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import { publicSupportStatus, PROJECT_PIX_KEY } from "../src/support.ts";

let app: FastifyInstance;

function cookieFrom(setCookie: unknown): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.equal(typeof first, "string");
  return first as string;
}

function sessionPair(setCookie: unknown): string {
  return cookieFrom(setCookie).split(";")[0];
}

async function register(name: string, email: string, password = "secret12") {
  return app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { name, email, password, acceptTerms: true, age18: true },
  });
}

describe("account security", () => {
  before(async () => {
    delete process.env.TRUST_PROXY;
    app = await buildApp();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("requires 8 to 128 characters, terms and an 18+ declaration", async () => {
    const short = await register("Curta", `short-${Date.now()}@test.co`, "secret1");
    assert.equal(short.statusCode, 400);
    const long = await register("Longa", `long-${Date.now()}@test.co`, "a".repeat(129));
    assert.equal(long.statusCode, 400);
    const noTerms = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Sem termo", email: `terms-${Date.now()}@test.co`, password: "secret12", acceptTerms: false, age18: true },
    });
    assert.equal(noTerms.statusCode, 400);
    const underAge = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Menor", email: `age-${Date.now()}@test.co`, password: "secret12", acceptTerms: true, age18: false },
    });
    assert.equal(underAge.statusCode, 400);
  });

  it("sets a 7 day cookie and revokes it on logout and password change", async () => {
    const email = `session-${Date.now()}@test.co`;
    const registered = await register("Sessão", email);
    assert.equal(registered.statusCode, 200);
    const header = cookieFrom(registered.headers["set-cookie"]);
    assert.match(header, /Max-Age=604800/);
    const cookie = sessionPair(registered.headers["set-cookie"]);
    const me = await app.inject({ method: "GET", url: "/me", headers: { cookie } });
    assert.equal(me.statusCode, 200);

    const legacy = legacyToken(me.json().id as string);
    assert.equal(readToken(legacy)?.sv, 0);
    const legacyMe = await app.inject({ method: "GET", url: "/me", headers: { cookie: `tf=${legacy}` } });
    assert.equal(legacyMe.statusCode, 200);

    const loggedOut = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    assert.equal(loggedOut.statusCode, 200);
    const afterLogout = await app.inject({ method: "GET", url: "/me", headers: { cookie } });
    assert.equal(afterLogout.statusCode, 401);
    const legacyAfter = await app.inject({ method: "GET", url: "/me", headers: { cookie: `tf=${legacy}` } });
    assert.equal(legacyAfter.statusCode, 401);

    const again = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "secret12" } });
    const nextCookie = sessionPair(again.headers["set-cookie"]);
    const changed = await app.inject({
      method: "POST",
      url: "/me/password",
      headers: { cookie: nextCookie },
      payload: { currentPassword: "secret12", nextPassword: "secret123" },
    });
    assert.equal(changed.statusCode, 200);
    const stale = await app.inject({ method: "GET", url: "/me", headers: { cookie: nextCookie } });
    assert.equal(stale.statusCode, 401);
    const oldPassword = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "secret12" } });
    assert.equal(oldPassword.statusCode, 401);
    const fresh = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "secret123" } });
    assert.equal(fresh.statusCode, 200);
  });

  it("backs off repeated failures for the same email", async () => {
    const email = `backoff-${Date.now()}@test.co`;
    await register("Trava", email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "errado12" } });
      assert.equal(failed.statusCode, 401);
    }
    const locked = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "secret12" } });
    assert.equal(locked.statusCode, 429);
  });

  it("exports JSON and deletes the account with the saves", async () => {
    const email = `gone-${Date.now()}@test.co`;
    const registered = await register("Apagar", email);
    const cookie = sessionPair(registered.headers["set-cookie"]);
    const world = await app.inject({ method: "GET", url: "/world" });
    const clubId = world.json().clubs[0].id as string;
    const save = await app.inject({ method: "POST", url: "/saves", headers: { cookie }, payload: { clubId } });
    assert.equal(save.statusCode, 200);
    const exported = await app.inject({ method: "GET", url: "/me/export", headers: { cookie } });
    assert.equal(exported.statusCode, 200);
    const body = exported.json();
    assert.equal(body.user.email, email);
    assert.equal(JSON.stringify(body).includes("passwordHash"), false);
    assert.equal(body.saves.length, 1);
    const wrong = await app.inject({ method: "DELETE", url: "/me", headers: { cookie }, payload: { password: "outra123" } });
    assert.equal(wrong.statusCode, 401);
    const removed = await app.inject({ method: "DELETE", url: "/me", headers: { cookie }, payload: { password: "secret12" } });
    assert.equal(removed.statusCode, 200);
    const me = await app.inject({ method: "GET", url: "/me", headers: { cookie } });
    assert.equal(me.statusCode, 401);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    assert.equal(await prisma.save.count({ where: { id: save.json().id as string } }), 0);
  });

  it("keeps public health to ok and db, and hides developer payment notes in production", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      assert.deepEqual(Object.keys(health.json()).sort(), ["db", "ok"]);
      const detail = await app.inject({ method: "GET", url: "/health/detail" });
      assert.equal(detail.statusCode, 404);
      const support = await app.inject({ method: "GET", url: "/support" });
      const text = JSON.stringify(support.json());
      assert.deepEqual(support.json().readiness.missing, []);
      assert.equal(text.includes("PIX_MERCHANT"), false);
      assert.equal(text.includes("webhook"), false);
    } finally {
      process.env.NODE_ENV = previous;
    }
    const hidden = publicSupportStatus({ NODE_ENV: "production", PIX_KEY: PROJECT_PIX_KEY });
    assert.deepEqual(hidden.readiness.missing, []);
  });
});

function legacyToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 60_000 })).toString("base64url");
  const secret = process.env.SESSION_SECRET ?? "techfoot-dev-secret-change-me";
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
