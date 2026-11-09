import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { enableSqliteWal, prisma } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import { PROJECT_PIX_KEY } from "../src/support.ts";

let app: FastifyInstance;

function cookieFrom(setCookie: unknown): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.equal(typeof first, "string");
  return (first as string).split(";")[0];
}

describe("support routes", () => {
  before(async () => {
    delete process.env.PIX_MERCHANT_NAME;
    delete process.env.PIX_MERCHANT_CITY;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PIX_KEY = PROJECT_PIX_KEY;
    app = await buildApp();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("publishes the Pix key without a BR Code, checkout or confirmation", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    const healthBody = health.json();
    assert.deepEqual(Object.keys(healthBody).sort(), ["db", "ok"]);
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.db, "up");
    assert.equal(JSON.stringify(healthBody).includes(PROJECT_PIX_KEY), false);
    const detail = await app.inject({ method: "GET", url: "/health/detail" });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().payments.pixBrCode, false);
    assert.equal(detail.json().payments.premiumCheckout, "unavailable");
    assert.equal(JSON.stringify(detail.json()).includes(PROJECT_PIX_KEY), false);
    await enableSqliteWal();
    const journal = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>("PRAGMA journal_mode");
    assert.equal(journal[0]?.journal_mode, "wal");

    const support = await app.inject({ method: "GET", url: "/support" });
    assert.equal(support.statusCode, 200);
    const body = support.json();
    assert.equal(body.pixKey, PROJECT_PIX_KEY);
    assert.equal(body.brCode, null);
    assert.equal(body.premiumCheckout, "unavailable");
    assert.equal(body.donationsUnlockFeatures, false);
    assert.equal(body.providerConfigured, false);
    assert.equal(body.readiness.copyKey, true);
    assert.equal(body.readiness.brCode, false);
    assert.equal(body.readiness.premiumCheckout, "unavailable");
    assert.ok(body.readiness.missing.some((item: string) => item.includes("PIX_MERCHANT_NAME")));
    assert.ok(body.readiness.missing.some((item: string) => item.includes("nenhuma doação libera recurso")));
  });

  it("stores a donation intent as unverified even if the client claims it is paid", async () => {
    const email = `support-${Date.now()}@test.co`;
    const registered = await app.inject({ method: "POST", url: "/auth/register", payload: { name: "Apoio", email, password: "secret12", acceptTerms: true, age18: true } });
    assert.equal(registered.statusCode, 200);
    const cookie = cookieFrom(registered.headers["set-cookie"]);
    const created = await app.inject({
      method: "POST",
      url: "/support/intents",
      headers: { cookie },
      payload: { amountCents: 1500, note: "intenção", status: "verified" },
    });
    assert.equal(created.statusCode, 200);
    const body = created.json();
    assert.equal(body.confirmed, false);
    assert.equal(body.unlocked, false);
    assert.equal(body.intent.status, "unverified");
    assert.equal(body.intent.unlocksFeatures, false);

    const listed = await app.inject({ method: "GET", url: "/support/intents", headers: { cookie } });
    assert.equal(listed.json().intents[0].status, "unverified");
    assert.equal(listed.json().unlocked, false);
  });

  it("refuses to verify a payment until a server webhook secret exists, then still unlocks nothing", async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const email = `hook-${Date.now()}@test.co`;
    const registered = await app.inject({ method: "POST", url: "/auth/register", payload: { name: "Hook", email, password: "secret12", acceptTerms: true, age18: true } });
    const cookie = cookieFrom(registered.headers["set-cookie"]);
    const created = await app.inject({
      method: "POST",
      url: "/support/intents",
      headers: { cookie },
      payload: { amountCents: 2000 },
    });
    const intentId = created.json().intent.id as string;
    const blocked = await app.inject({ method: "POST", url: "/support/webhooks/payment", payload: { intentId } });
    assert.equal(blocked.statusCode, 503);
    assert.equal(blocked.json().unlocked, false);
    const stillOpen = await prisma.supportIntent.findUniqueOrThrow({ where: { id: intentId } });
    assert.equal(stillOpen.status, "unverified");

    const secret = "test-webhook-secret-not-for-production";
    process.env.PAYMENT_WEBHOOK_SECRET = secret;
    const raw = JSON.stringify({ intentId });
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    const forged = await app.inject({
      method: "POST",
      url: "/support/webhooks/payment",
      headers: { "content-type": "application/json", "x-techfoot-signature": "00" },
      payload: raw,
    });
    assert.equal(forged.statusCode, 401);
    const verified = await app.inject({
      method: "POST",
      url: "/support/webhooks/payment",
      headers: { "content-type": "application/json", "x-techfoot-signature": signature },
      payload: raw,
    });
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.json().status, "verified");
    assert.equal(verified.json().unlocked, false);
    assert.match(verified.json().message, /Nenhum recurso/);
    const stored = await prisma.supportIntent.findUniqueOrThrow({ where: { id: intentId } });
    assert.equal(stored.status, "verified");
    delete process.env.PAYMENT_WEBHOOK_SECRET;
  });
});
