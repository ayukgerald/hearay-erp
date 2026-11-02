import type { OrderStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { handle } from "@/lib/errors";
import { ORDER_STATUSES } from "@/lib/order-status";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

/** Queue with filters: ?status=paid|all|<status>&q=<reference|phone|smartcard>&page=1 */
export const GET = handle(async (req: Request) => {
  await requireAdmin(["owner", "staff"]);
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "paid";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const where: Prisma.OrderWhereInput = {};
  if (statusParam !== "all" && ORDER_STATUSES.includes(statusParam as OrderStatus)) {
    where.status = statusParam as OrderStatus;
  }
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.OrderWhereInput[] = [{ reference: { contains: q.toUpperCase() } }];
    if (digits.length >= 3) {
      or.push({ smartcardNumber: { contains: digits } });
      or.push({ customerPhone: { contains: digits.replace(/^(00)?237(?=\d{9}$)/, "") } });
    }
    where.OR = or;
  }

  // The work queue (paid) is first-in-first-out; everything else newest first.
  const orderBy: Prisma.OrderOrderByWithRelationInput = {
    createdAt: statusParam === "paid" ? "asc" : "desc",
  };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        events: { where: { toStatus: "paid" }, select: { createdAt: true } },
        renewedBy: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      smartcardNumber: o.smartcardNumber,
      packageName: o.packageName,
      months: o.months,
      totalXaf: o.totalXaf,
      customerPhone: o.customerPhone,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
      paidAt: o.events[0]?.createdAt ?? null,
      renewedAt: o.renewedAt,
      renewedBy: o.renewedBy?.name ?? null,
      adminNote: o.adminNote,
    })),
  });
});
