import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a.trim().toLowerCase(), "utf8");
  const bb = Buffer.from(b.trim().toLowerCase(), "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
