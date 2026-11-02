import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin(["owner", "staff"]);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Order not found");
  const order = await db.order.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      smsMessages: { orderBy: { createdAt: "asc" } },
      renewedBy: { select: { id: true, name: true } },
    },
  });
  if (!order) throw new ApiError("NOT_FOUND", "Order not found");

  // Show admin names instead of raw ids in the history.
  const adminIds = order.events
    .map((e) => e.actor.replace(/^admin:/, ""))
    .filter((a) => /^[0-9a-f-]{36}$/.test(a));
  const admins = await db.adminUser.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, name: true },
  });
  const names = new Map(admins.map((a) => [a.id, a.name]));

  return NextResponse.json({
    ...order,
    events: order.events.map((e) => ({
      ...e,
      actorName: names.get(e.actor.replace(/^admin:/, "")) ?? e.actor,
    })),
  });
});
