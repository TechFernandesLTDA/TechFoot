import { createHmac, timingSafeEqual } from "node:crypto";
import { PROJECT_PIX_KEY } from "@techfoot/shared";
import { pixBrCode } from "./pix.ts";

export { PROJECT_PIX_KEY };

export type SupportEnv = {
  PIX_KEY?: string;
  PIX_MERCHANT_NAME?: string;
  PIX_MERCHANT_CITY?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
};

export type PublicSupport = {
  pixKey: string;
  pixKeyType: "email";
  brCode: string | null;
  brCodeAvailable: boolean;
  brCodeUnavailableReason: string | null;
  premiumCheckout: "unavailable";
  providerConfigured: boolean;
  donationsUnlockFeatures: false;
  notice: string;
  readiness: {
    copyKey: true;
    brCode: boolean;
    premiumCheckout: "unavailable";
    missing: string[];
  };
};

const MISSING_MERCHANT = "QR Code e BR Code Pix não são gerados porque o nome e a cidade do recebedor não estão configurados. Esses dados não são inventados. Copiar a chave não confirma pagamento e não libera nada no jogo.";

export function publicSupportStatus(env: SupportEnv = process.env): PublicSupport {
  const pixKey = env.PIX_KEY?.trim() || PROJECT_PIX_KEY;
  const merchantName = env.PIX_MERCHANT_NAME?.trim() ?? "";
  const merchantCity = env.PIX_MERCHANT_CITY?.trim() ?? "";
  const providerConfigured = Boolean(env.PAYMENT_WEBHOOK_SECRET?.trim());
  let brCode: string | null = null;
  let brCodeUnavailableReason: string | null = MISSING_MERCHANT;
  if (merchantName && merchantCity) {
    brCode = pixBrCode({ key: pixKey, merchantName, merchantCity });
    brCodeUnavailableReason = brCode
      ? null
      : "Nome ou cidade do recebedor ficaram inválidos depois da normalização do BR Code. Nenhum código foi gerado.";
  }
  const missing = [
    ...(brCode ? [] : ["Nome e cidade reais do recebedor, nas variáveis PIX_MERCHANT_NAME e PIX_MERCHANT_CITY"]),
    "Um provedor de pagamento com confirmação no servidor. O segredo de webhook, sozinho, não é esse provedor",
    "Nesta versão nenhuma doação libera recurso, mesmo depois de uma verificação",
  ];
  return {
    pixKey,
    pixKeyType: "email",
    brCode,
    brCodeAvailable: Boolean(brCode),
    brCodeUnavailableReason,
    premiumCheckout: "unavailable",
    providerConfigured,
    donationsUnlockFeatures: false,
    notice: "Apoio voluntário. Copiar a chave, exibir um código ou registrar uma intenção não confirma Pix e não libera nada no jogo.",
    readiness: { copyKey: true, brCode: Boolean(brCode), premiumCheckout: "unavailable", missing },
  };
}

export function verifyPaymentSignature(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!header?.trim() || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.trim().toLowerCase();
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
