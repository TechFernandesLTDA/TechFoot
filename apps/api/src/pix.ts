const CRC_POLY = 0x1021;

export function crc16CcittFalse(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ CRC_POLY) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

export function sanitizePixText(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .slice(0, max);
}

export type PixBrCodeInput = {
  key: string;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  txid?: string;
};

export function pixBrCode(input: PixBrCodeInput): string | null {
  const key = input.key.trim();
  const merchantName = sanitizePixText(input.merchantName, 25);
  const merchantCity = sanitizePixText(input.merchantCity, 15);
  if (!key || key.length > 77 || !merchantName || !merchantCity) return null;
  const account = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", key);
  const txid = (input.txid?.trim() || "***").slice(0, 25);
  let payload = tlv("00", "01") + tlv("01", "11") + tlv("26", account) + tlv("52", "0000") + tlv("53", "986");
  if (input.amount !== undefined && Number.isFinite(input.amount) && input.amount > 0) {
    payload += tlv("54", input.amount.toFixed(2));
  }
  payload += tlv("58", "BR") + tlv("59", merchantName) + tlv("60", merchantCity) + tlv("62", tlv("05", txid)) + "6304";
  return payload + crc16CcittFalse(payload);
}
