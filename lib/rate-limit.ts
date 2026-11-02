import { config } from "./config";
import { db } from "./db";
import { ApiError } from "./errors";

export const ORDERS_PER_PHONE_PER_HOUR = 5;
export const ORDERS_PER_IP_PER_HOUR = 20;
const HOUR = 60 * 60 * 1000;

/**
 * Per-IP counter kept in memory. On serverless each warm instance has its own
 * counter, so this is a soft limit; the per-phone limit below is exact
 * because it counts rows in the database.
 */
const ipHits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

export function hitIp(ip: string, now: number, limit = ORDERS_PER_IP_PER_HOUR): boolean {
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= limit) {
    ipHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 10_000) ipHits.clear(); // crude memory guard
  return true;
}

export async function enforceOrderRateLimits(req: Request, phoneE164: string, now: Date) {
  if (process.env.DISABLE_RATE_LIMIT === "1" && (!config.isProduction || config.unsafeTestMode))
    return;
  const recentForPhone = await db.order.count({
    where: { customerPhone: phoneE164, createdAt: { gte: new Date(now.getTime() - HOUR) } },
  });
  if (recentForPhone >= ORDERS_PER_PHONE_PER_HOUR) {
    throw new ApiError(
      "RATE_LIMITED",
      "Too many orders for this phone number. Please wait an hour and try again.",
    );
  }
  if (!hitIp(clientIp(req), now.getTime())) {
    throw new ApiError(
      "RATE_LIMITED",
      "Too many orders from this connection. Please wait and try again.",
    );
  }
}
