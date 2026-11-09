import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertReadyToListen, sessionCookie, startupIssues } from "../src/config.ts";

describe("startup config", () => {
  it("accepts local development without a production secret", () => {
    const issues = startupIssues({
      NODE_ENV: "development",
      DATABASE_URL: "file:./dev.db",
      SESSION_SECRET: "techfoot-dev-secret-change-me",
    });
    assert.equal(issues.some((issue) => issue.level === "fatal"), false);
  });

  it("refuses to listen in production with the example secret or a short secret", () => {
    const base = { NODE_ENV: "production", DATABASE_URL: "file:/data/techfoot.db", WEB_ORIGIN: "https://example.com" };
    assert.throws(() => assertReadyToListen({ ...base, SESSION_SECRET: "techfoot-dev-secret-change-me" }));
    assert.throws(() => assertReadyToListen({ ...base, SESSION_SECRET: "SUBSTITUA-POR-UM-SEGREDO-EXCLUSIVO" }));
    assert.throws(() => assertReadyToListen({ ...base, SESSION_SECRET: "curto-demais" }));
    assert.doesNotThrow(() => assertReadyToListen({ ...base, SESSION_SECRET: "x".repeat(24) }));
    const missingOrigin = startupIssues({ ...base, WEB_ORIGIN: "", SESSION_SECRET: "x".repeat(24) });
    assert.equal(missingOrigin.some((issue) => issue.message.includes("WEB_ORIGIN")), true);
  });

  it("requires merchant name and city together and marks the session cookie secure in production", () => {
    const warning = startupIssues({
      NODE_ENV: "development",
      DATABASE_URL: "file:./dev.db",
      PIX_MERCHANT_NAME: "TechFoot",
    });
    assert.equal(warning.some((issue) => issue.level === "warning" && issue.message.includes("PIX_MERCHANT_CITY")), true);
    const fatal = startupIssues({
      NODE_ENV: "production",
      DATABASE_URL: "file:/data/techfoot.db",
      WEB_ORIGIN: "https://example.com",
      SESSION_SECRET: "x".repeat(24),
      PIX_MERCHANT_CITY: "Recife",
    });
    assert.equal(fatal.some((issue) => issue.level === "fatal"), true);
    assert.equal(sessionCookie({ NODE_ENV: "production" }).secure, true);
    assert.equal(sessionCookie({ NODE_ENV: "development" }).secure, false);
    assert.equal(sessionCookie({ NODE_ENV: "development" }).httpOnly, true);
  });
});
