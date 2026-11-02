import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { handle } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const packages = await db.package.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, monthlyPriceXaf: true, badge: true },
  });
  return NextResponse.json({
    packages,
    serviceFeeXaf: config.serviceFeeXaf,
    smartcardLengths: config.smartcardLengths,
    months: [1, 3, 6, 12],
  });
});
