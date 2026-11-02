import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { ApiError, handle } from "@/lib/errors";
import { startPayment } from "@/lib/payments/service";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Order not found");
  const result = await startPayment(id, now(req));
  return NextResponse.json(result, { status: 202 });
});
