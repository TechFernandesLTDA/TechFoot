import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc16CcittFalse, pixBrCode } from "../src/pix.ts";
import { PROJECT_PIX_KEY, publicSupportStatus } from "../src/support.ts";

describe("pix", () => {
  it("matches the CRC-16/CCITT-FALSE test vector", () => {
    assert.equal(crc16CcittFalse("123456789"), "29B1");
  });

  it("does not invent a BR Code without merchant name and city", () => {
    assert.equal(pixBrCode({ key: PROJECT_PIX_KEY, merchantName: "", merchantCity: "BRASILIA" }), null);
    assert.equal(pixBrCode({ key: PROJECT_PIX_KEY, merchantName: "TECHFOOT", merchantCity: "   " }), null);
    assert.equal(pixBrCode({ key: PROJECT_PIX_KEY, merchantName: "!!!", merchantCity: "???" }), null);
    const status = publicSupportStatus({ PIX_KEY: PROJECT_PIX_KEY });
    assert.equal(status.brCode, null);
    assert.equal(status.brCodeAvailable, false);
    assert.equal(status.premiumCheckout, "unavailable");
    assert.equal(status.donationsUnlockFeatures, false);
    assert.equal(status.providerConfigured, false);
    assert.match(status.brCodeUnavailableReason ?? "", /não são gerados/i);
  });

  it("builds a static BR Code only from the supplied receiver fields", () => {
    const code = pixBrCode({ key: PROJECT_PIX_KEY, merchantName: "Tech Foot", merchantCity: "São Paulo", amount: 15 });
    assert.ok(code);
    assert.match(code!, /^000201/);
    assert.ok(code!.includes("BR.GOV.BCB.PIX"));
    assert.ok(code!.includes(PROJECT_PIX_KEY));
    assert.ok(code!.includes("TECH FOOT"));
    assert.ok(code!.includes("SAO PAULO"));
    assert.ok(code!.includes("15.00"));
    assert.equal(code!.slice(-4), crc16CcittFalse(code!.slice(0, -4)));
    const configured = publicSupportStatus({
      PIX_KEY: PROJECT_PIX_KEY,
      PIX_MERCHANT_NAME: "Tech Foot",
      PIX_MERCHANT_CITY: "São Paulo",
    });
    assert.equal(configured.brCodeAvailable, true);
    assert.equal(configured.premiumCheckout, "unavailable");
    assert.equal(configured.donationsUnlockFeatures, false);
  });
});
