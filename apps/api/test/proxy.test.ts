import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/db.ts";
import { buildApp } from "../src/server.ts";

const nginx = "10.0.0.2";
const traefik = "10.0.0.3";
const client = "198.51.100.23";

function forwarded(spoof: string, realClient = client): string {
  return `${spoof}, ${realClient}, ${traefik}`;
}

describe("trust proxy", () => {
  let app: FastifyInstance;

  after(async () => {
    delete process.env.TRUST_PROXY;
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it("trusts two private hops and ignores a spoofed leftmost X-Forwarded-For", async () => {
    process.env.TRUST_PROXY = "true";
    app = await buildApp();
    const seen: string[] = [];
    let protocol = "";
    app.addHook("onRequest", async (req) => {
      seen.push(req.ip);
      protocol = req.protocol;
    });
    const health = await app.inject({
      method: "GET",
      url: "/health",
      remoteAddress: nginx,
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": forwarded("203.0.113.9") },
    });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().db, "up");
    const spoofed = await app.inject({
      method: "GET",
      url: "/health",
      remoteAddress: nginx,
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": forwarded("203.0.113.99") },
    });
    assert.equal(spoofed.statusCode, 200);
    assert.equal(protocol, "https");
    assert.deepEqual(seen, [client, client]);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: nginx,
        headers: { "x-forwarded-for": forwarded("203.0.113.9") },
        payload: { email: `spoof-${attempt}@test.co`, password: "wrongpass" },
      });
      assert.equal(login.statusCode, 401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: nginx,
      headers: { "x-forwarded-for": forwarded("203.0.113.50") },
      payload: { email: "spoof-next@test.co", password: "wrongpass" },
    });
    assert.equal(blocked.statusCode, 429);
    const otherClient = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: nginx,
      headers: { "x-forwarded-for": forwarded("203.0.113.50", "198.51.100.77") },
      payload: { email: "spoof-other@test.co", password: "wrongpass" },
    });
    assert.equal(otherClient.statusCode, 401);
  });
});
