import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/errors";
import { InvalidTransitionError, transitionOrder, OrderConflictError } from "@/lib/orders";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";
const schema = z.object({
  reason: z.string().trim().min(3, "Give a reason for the refund").max(500),
});

/**
 * paid -> refunded with a reason. In phase 1 the money itself is sent back
 * from the aggregator dashboard; this records that it was done.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(["owner"]);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Order not found");
  const { reason } = schema.parse(await readJson(req));
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) throw new ApiError("NOT_FOUND", "Order not found");
  try {
    const order = await transitionOrder(id, "refunded", `admin:${admin.id}`, {
      note: reason,
      data: {
        adminNote: existing.adminNote
          ? `${existing.adminNote}\nRefunded: ${reason}`
          : `Refunded: ${reason}`,
      },
    });
    return NextResponse.json({ id: order.id, reference: order.reference, status: order.status });
  } catch (err) {
    if (err instanceof InvalidTransitionError || err instanceof OrderConflictError) {
      throw new ApiError(
        "CONFLICT",
        `Order ${existing.reference} is ${existing.status} and cannot be refunded.`,
      );
    }
    throw err;
  }
});
