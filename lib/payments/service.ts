import type { Order, Payment, PaymentStatus, Prisma } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { ApiError } from "../errors";
import { transitionOrder, OrderConflictError } from "../orders";
import { InvalidTransitionError, type Actor } from "../order-status";
import { sendOrderSms } from "../sms";
import { getPaymentProvider, getProviderByName } from "./index";
import { ProviderUnavailableError, type ProviderResult } from "./types";

export const MAX_PAYMENT_ATTEMPTS_PER_ORDER = 5;
const OPEN: PaymentStatus[] = ["initiated", "pending"];

export function orderExpiresAt(order: Pick<Order, "createdAt">): Date {
  return new Date(order.createdAt.getTime() + config.orderExpiryMinutes * 60_000);
}

const METHOD_LABEL = { mtn_momo: "MTN Mobile Money", orange_money: "Orange Money" } as const;

/** POST /api/orders/{id}/pay — start (or resend) a mobile money prompt. */
export async function startPayment(orderId: string, now: Date) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!order) throw new ApiError("NOT_FOUND", "Order not found");
  const expiresAt = orderExpiresAt(order);
  if (order.status !== "awaiting_payment" || now >= expiresAt) {
    throw new ApiError("ORDER_NOT_PAYABLE", "This order can no longer be paid. Start a new order.");
  }
  if (order.payments.length >= MAX_PAYMENT_ATTEMPTS_PER_ORDER) {
    throw new ApiError(
      "RATE_LIMITED",
      "Too many payment attempts for this order. Start a new order.",
    );
  }

  const provider = getPaymentProvider();
  let result: ProviderResult;
  try {
    result = await provider.startCollection(
      {
        merchantReference: `${order.reference}-${order.payments.length + 1}`,
        amountXaf: order.totalXaf,
        phone: order.customerPhone,
        method: order.paymentMethod,
        description: `DStv ${order.packageName} x${order.months} - ${order.reference}`,
        callbackUrl: `${config.appUrl}/api/webhooks/${provider.name}`,
      },
      { now },
    );
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      console.error("[pay] provider unavailable", err.message);
      throw new ApiError(
        "PROVIDER_UNAVAILABLE",
        `${METHOD_LABEL[order.paymentMethod]} is not responding right now. Please try again in a minute.`,
      );
    }
    throw err;
  }

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      providerReference: result.providerReference,
      amountXaf: order.totalXaf,
      phone: order.customerPhone,
      method: order.paymentMethod,
      status: result.status === "pending" ? "pending" : "initiated",
      rawResponse: toJson(result.raw),
    },
  });
  // A provider can refuse instantly (e.g. unknown number); apply that like any other result.
  const applied =
    result.status === "pending"
      ? payment
      : (await applyProviderResult(payment.id, result, "system")).payment;
  return { paymentId: applied.id, status: applied.status, expiresAt };
}

/**
 * Apply what the provider says about one payment. This is the only path that
 * marks an order paid (called from the verified webhook, the customer status
 * poll's provider check, and the reconcile job).
 */
export async function applyProviderResult(paymentId: string, result: ProviderResult, actor: Actor) {
  const outcome = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

    let status: PaymentStatus = result.status;
    let failureReason = result.failureReason ?? null;

    // Never let a later "pending"/"failed" overwrite money we already confirmed.
    if (payment.status === "succeeded") status = "succeeded";

    if (
      status === "succeeded" &&
      result.amountXaf != null &&
      result.amountXaf !== payment.amountXaf
    ) {
      status = "failed";
      failureReason = `Amount mismatch: provider reported ${result.amountXaf}, expected ${payment.amountXaf}`;
    }

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status,
        failureReason: status === "succeeded" ? null : failureReason,
        rawResponse: toJson(result.raw),
      },
    });

    let becamePaid = false;
    if (status === "succeeded" && payment.status !== "succeeded") {
      if (["awaiting_payment", "payment_failed", "expired"].includes(order.status)) {
        const late = order.status !== "awaiting_payment";
        await transitionOrder(order.id, "paid", actor, {
          tx,
          note: `Payment ${updated.providerReference} confirmed${late ? ` after order was ${order.status}` : ""}`,
        });
        becamePaid = true;
      } else {
        // Order already paid by another attempt: flag the double charge for staff.
        await tx.order.update({
          where: { id: order.id },
          data: {
            adminNote: appendNote(
              order.adminNote,
              `DUPLICATE PAYMENT ${updated.providerReference} (${updated.amountXaf} FCFA) — refund in the aggregator dashboard.`,
            ),
          },
        });
      }
    } else if (
      (status === "failed" || status === "expired") &&
      order.status === "awaiting_payment"
    ) {
      const stillOpen = await tx.payment.count({
        where: { orderId: order.id, id: { not: payment.id }, status: { in: OPEN } },
      });
      if (stillOpen === 0) {
        await transitionOrder(order.id, "payment_failed", actor, {
          tx,
          note: failureReason ?? "Payment was not completed",
        });
      }
    }
    return { payment: updated, orderId: order.id, becamePaid };
  });

  if (outcome.becamePaid) await sendOrderSms(outcome.orderId, "payment_received");
  return outcome;
}

/** Ask the provider about one open payment and apply the answer. */
export async function refreshPayment(payment: Payment, actor: Actor, now: Date) {
  if (!OPEN.includes(payment.status)) return payment;
  const provider = getProviderByName(payment.provider);
  if (!provider) return payment;
  try {
    const result = await provider.getStatus(payment.providerReference, { now });
    if (result.status === "pending" && payment.status === "pending") {
      return payment; // nothing new; avoid a write on every poll
    }
    return (await applyProviderResult(payment.id, result, actor)).payment;
  } catch (err) {
    if (err instanceof ProviderUnavailableError || err instanceof OrderConflictError) {
      console.warn("[payments] refresh skipped:", (err as Error).message);
      return payment;
    }
    throw err;
  }
}

/**
 * Bring one order up to date: check open payments with the provider, then
 * expire it if it is still unpaid after the expiry window.
 */
export async function syncOrder(orderId: string, now: Date, actor: Actor = "system") {
  const payments = await db.payment.findMany({ where: { orderId, status: { in: OPEN } } });
  for (const p of payments) await refreshPayment(p, actor, now);
  await expireIfDue(orderId, now);
}

export async function expireIfDue(orderId: string, now: Date) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "awaiting_payment" || now < orderExpiresAt(order)) return false;
  try {
    await db.$transaction(async (tx) => {
      await transitionOrder(order.id, "expired", "system", {
        tx,
        note: `No payment confirmation within ${config.orderExpiryMinutes} minutes`,
      });
    });
    return true;
  } catch (err) {
    if (err instanceof OrderConflictError || err instanceof InvalidTransitionError) return false;
    throw err;
  }
}

function appendNote(existing: string | null, line: string) {
  return existing ? `${existing}\n${line}` : line;
}

function toJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? {})) as Prisma.InputJsonValue;
}
