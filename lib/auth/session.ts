import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed cookie used by AUTH_MODE=dev only: "<adminId>.<expiresMs>.<sig>" */
export const DEV_COOKIE = "hearay_admin";
const TTL_MS = 12 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ characters)");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createDevSessionToken(adminId: string, now = Date.now()) {
  const payload = `${adminId}.${now + TTL_MS}`;
  return { token: `${payload}.${sign(payload)}`, maxAge: TTL_MS / 1000 };
}

export function readDevSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < now) return null;
  return id;
}
