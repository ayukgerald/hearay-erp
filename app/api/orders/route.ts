import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/errors";
import { computeTotal } from "@/lib/money";
import { normalizeCameroonPhone } from "@/lib/phone";
import { enforceOrderRateLimits } from "@/lib/rate-limit";
import { nextReference } from "@/lib/reference";
import { validateSmartcard } from "@/lib/smartcard";
import { createOrderSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const input = createOrderSchema.parse(await readJson(req));

  const card = validateSmartcard(input.smartcardNumber, config.smartcardLengths);
  if (!card.ok)
    throw new ApiError("VALIDATION_FAILED", card.reason, [
      { path: "smartcardNumber", message: card.reason },
    ]);
  const confirm = input.smartcardConfirm.replace(/[\s-]/g, "");
  if (confirm !== card.value) {
    throw new ApiError(
      "SMARTCARD_MISMATCH",
      "The two smartcard numbers do not match. Check and type them again.",
    );
  }
  const phone = normalizeCameroonPhone(input.phone);
  if (!phone.ok)
    throw new ApiError("VALIDATION_FAILED", phone.reason, [
      { path: "phone", message: phone.reason },
    ]);

  const pkg = await db.package.findUnique({ where: { id: input.packageId } });
  if (!pkg || !pkg.isActive || pkg.monthlyPriceXaf <= 0) {
    throw new ApiError(
      "PACKAGE_INACTIVE",
      "This package is not available right now. Please choose another.",
    );
  }

  const at = now(req);
  await enforceOrderRateLimits(req, phone.e164, at);

  // Prices and totals always come from the database, never from the browser.
  const fee = config.serviceFeeXaf;
  const total = computeTotal(pkg.monthlyPriceXaf, input.months, fee);

  const order = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx);
    const created = await tx.order.create({
      data: {
        reference,
        smartcardNumber: card.value,
        packageId: pkg.id,
        packageName: pkg.name,
        monthlyPriceXaf: pkg.monthlyPriceXaf,
        months: input.months,
        serviceFeeXaf: fee,
        totalXaf: total,
        customerPhone: phone.e164,
        paymentMethod: input.paymentMethod,
        status: "awaiting_payment",
        createdAt: at,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: created.id,
        fromStatus: null,
        toStatus: "awaiting_payment",
        actor: "system",
        note: "Order created",
      },
    });
    return created;
  });

  return NextResponse.json(
    {
      id: order.id,
      reference: order.reference,
      packageName: order.packageName,
      months: order.months,
      monthlyPriceXaf: order.monthlyPriceXaf,
      serviceFeeXaf: order.serviceFeeXaf,
      totalXaf: order.totalXaf,
      status: order.status,
    },
    { status: 201 },
  );
});
