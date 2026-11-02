import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { handle } from "@/lib/errors";
import { startOfDayDouala } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The four admin cards: to renew, paid today (+ FCFA), renewed today, failed/expired today. */
export const GET = handle(async () => {
  await requireAdmin(["owner", "staff"]);
  const since = startOfDayDouala(new Date());

  const [toRenew, oldestPaid, paidEvents, renewedToday, failedToday] = await Promise.all([
    db.order.count({ where: { status: "paid" } }),
    db.order.findFirst({
      where: { status: "paid" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    db.orderEvent.findMany({
      where: { toStatus: "paid", createdAt: { gte: since } },
      select: { order: { select: { totalXaf: true } } },
    }),
    db.order.count({ where: { status: "renewed", renewedAt: { gte: since } } }),
    db.orderEvent.count({
      where: { toStatus: { in: ["payment_failed", "expired"] }, createdAt: { gte: since } },
    }),
  ]);

  return NextResponse.json({
    since,
    toRenew,
    oldestWaitingSince: oldestPaid?.createdAt ?? null,
    paidToday: paidEvents.length,
    paidTodayXaf: paidEvents.reduce((sum, e) => sum + e.order.totalXaf, 0),
    renewedToday,
    failedToday,
  });
});
