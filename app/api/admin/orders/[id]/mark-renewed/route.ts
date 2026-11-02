import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/errors";
import { InvalidTransitionError, transitionOrder, OrderConflictError } from "@/lib/orders";
import { sendOrderSms } from "@/lib/sms";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";
const schema = z.object({ note: z.string().trim().max(500).optional() });

/** paid -> renewed, saves the note (e.g. DStv agent receipt number), sends the "renewed" SMS. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(["owner", "staff"]);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Order not found");
  const { note } = schema.parse(await readJson(req));
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) throw new ApiError("NOT_FOUND", "Order not found");

  try {
    const order = await transitionOrder(id, "renewed", `admin:${admin.id}`, {
      note: note || null,
      data: {
        renewedById: admin.id,
        renewedAt: new Date(),
        adminNote: note
          ? existing.adminNote
            ? `${existing.adminNote}\n${note}`
            : note
          : existing.adminNote,
      },
    });
    await sendOrderSms(order.id, "renewed");
    return NextResponse.json({
      id: order.id,
      reference: order.reference,
      status: order.status,
      renewedAt: order.renewedAt,
    });
  } catch (err) {
    if (err instanceof InvalidTransitionError || err instanceof OrderConflictError) {
      throw new ApiError(
        "CONFLICT",
        `Order ${existing.reference} is ${existing.status} and cannot be marked renewed.`,
      );
    }
    throw err;
  }
});
