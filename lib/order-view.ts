import type { Order, OrderEvent, Package, Payment } from "@prisma/client";
import { orderExpiresAt } from "./payments/service";
import { maskPhone } from "./phone";

type FullOrder = Order & {
  payments: Payment[];
  events: OrderEvent[];
  package: Pick<Package, "code">;
};

/** Public view of an order, used by the Approve and Confirmation screens. */
export function publicOrderView(o: FullOrder) {
  const latest = [...o.payments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const succeeded = o.payments.find((p) => p.status === "succeeded");
  const shown = succeeded ?? latest;
  const at = (s: Order["status"]) => o.events.find((e) => e.toStatus === s)?.createdAt ?? null;
  const failedEvent = o.events.find(
    (e) => e.toStatus === "payment_failed" || e.toStatus === "expired",
  );
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    paymentStatus: shown?.status ?? null,
    failureReason:
      o.status === "payment_failed" || o.status === "expired"
        ? (shown?.failureReason ?? failedEvent?.note ?? null)
        : null,
    packageCode: o.package.code,
    packageName: o.packageName,
    months: o.months,
    monthlyPriceXaf: o.monthlyPriceXaf,
    serviceFeeXaf: o.serviceFeeXaf,
    totalXaf: o.totalXaf,
    smartcardNumber: o.smartcardNumber,
    phoneMasked: maskPhone(o.customerPhone),
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt,
    expiresAt: orderExpiresAt(o),
    paidAt: at("paid"),
    renewedAt: o.renewedAt,
    refundedAt: at("refunded"),
    paymentAttempts: o.payments.length,
  };
}
export type PublicOrder = ReturnType<typeof publicOrderView>;
