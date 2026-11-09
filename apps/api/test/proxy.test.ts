import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/db.ts";
import { buildApp } from "../src/server.ts";

describe("trust proxy", () => {
  let app: FastifyInstance;

  after(async () => {
    delete process.env.TRUST_PROXY;
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it("honors X-Forwarded-Proto when TRUST_PROXY=true so Secure cookies work behind Traefik", async () => {
    process.env.TRUST_PROXY = "true";
    app = await buildApp();
    const seen: { protocol?: string; ip?: string } = {};
    app.addHook("onRequest", async (req) => {
      seen.protocol = req.protocol;
      seen.ip = req.ip;
    });
    const health = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.8" },
    });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().db, "up");
    assert.equal(seen.protocol, "https");
    assert.equal(seen.ip, "203.0.113.8");
  });
});
