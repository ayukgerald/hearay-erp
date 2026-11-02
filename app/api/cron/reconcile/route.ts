import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/errors";
import { applyProviderResult, expireIfDue, refreshPayment } from "@/lib/payments/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (config.isProduction) throw new ApiError("UNAUTHORIZED", "CRON_SECRET is not configured");
    return;
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    throw new ApiError("UNAUTHORIZED", "Bad cron secret");
}

/** Vercel Cron calls with GET; POST is accepted for manual runs and external schedulers. */
async function reconcile(req: Request) {
  authorize(req);
  const at = now(req);
  const cutoff = new Date(at.getTime() - GIVE_UP_AFTER_MS);

  // 1. Re-check open payments with the provider (missed or late webhooks).
  const open = await db.payment.findMany({
    where: { status: { in: ["initiated", "pending"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  let checked = 0;
  let abandoned = 0;
  for (const p of open) {
    if (p.createdAt < cutoff) {
      await applyProviderResult(
        p.id,
        {
          providerReference: p.providerReference,
          status: "expired",
          failureReason: "No confirmation after 24 hours",
          raw: p.rawResponse,
        },
        "system",
      );
      abandoned++;
    } else {
      await refreshPayment(p, "system", at);
      checked++;
    }
  }

  // 2. Expire orders still unpaid after the expiry window.
  const due = await db.order.findMany({
    where: {
      status: "awaiting_payment",
      createdAt: { lte: new Date(at.getTime() - config.orderExpiryMinutes * 60_000) },
    },
    select: { id: true },
    take: 500,
  });
  let expired = 0;
  for (const o of due) if (await expireIfDue(o.id, at)) expired++;

  return NextResponse.json({
    ok: true,
    at: at.toISOString(),
    paymentsChecked: checked,
    paymentsAbandoned: abandoned,
    ordersExpired: expired,
  });
}

export const GET = handle(reconcile);
export const POST = handle(reconcile);
