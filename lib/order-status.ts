import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "renewed",
  "payment_failed",
  "expired",
  "refunded",
];

/**
 * Allowed order status moves.
 *
 *   awaiting_payment -> paid | payment_failed | expired
 *   paid             -> renewed | refunded
 *
 * Late money: if the provider confirms a payment after we already gave up on
 * the order (payment_failed or expired), the customer has been charged, so the
 * order must still become paid. Those two moves are allowed only for the
 * "webhook" and "system" actors (a provider confirmation), never for admins.
 */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["paid", "payment_failed", "expired"],
  paid: ["renewed", "refunded"],
  payment_failed: ["paid"],
  expired: ["paid"],
  renewed: [],
  refunded: [],
};

const PROVIDER_ONLY = new Set(["payment_failed->paid", "expired->paid", "awaiting_payment->paid"]);

export type Actor = "system" | "webhook" | `admin:${string}`;

export function isProviderActor(actor: Actor): boolean {
  return actor === "system" || actor === "webhook";
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  if (!ALLOWED[from]?.includes(to)) return false;
  if (PROVIDER_ONLY.has(`${from}->${to}`) && !isProviderActor(actor)) return false;
  return true;
}

export class InvalidTransitionError extends Error {
  constructor(
    public from: OrderStatus,
    public to: OrderStatus,
    public actor: Actor,
  ) {
    super(`Order cannot move from ${from} to ${to} (actor ${actor})`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
}

export const ALLOWED_TRANSITIONS = ALLOWED;
