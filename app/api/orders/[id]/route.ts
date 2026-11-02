import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/errors";
import { publicOrderView } from "@/lib/order-view";
import { syncOrder } from "@/lib/payments/service";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Screens poll every 3 s; ask the provider at most this often per order (per instance).
const PROVIDER_CHECK_EVERY_MS = 5_000;
const lastCheck = new Map<string, number>();

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Order not found");

  const head = await db.order.findUnique({ where: { id }, select: { status: true } });
  if (!head) throw new ApiError("NOT_FOUND", "Order not found");

  const at = now(req);
  if (head.status === "awaiting_payment") {
    const last = lastCheck.get(id) ?? 0;
    if (Date.now() - last >= PROVIDER_CHECK_EVERY_MS || req.headers.has("x-test-now")) {
      lastCheck.set(id, Date.now());
      if (lastCheck.size > 5_000) lastCheck.clear();
      await syncOrder(id, at); // provider status check + expiry
    }
  }

  const order = await db.order.findUniqueOrThrow({
    where: { id },
    include: {
      payments: true,
      events: { orderBy: { createdAt: "asc" } },
      package: { select: { code: true } },
    },
  });
  return NextResponse.json(publicOrderView(order), { headers: { "Cache-Control": "no-store" } });
});
