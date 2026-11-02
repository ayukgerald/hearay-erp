import type { OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  ORDER_STATUSES,
  type Actor,
} from "@/lib/order-status";

const ADMIN: Actor = "admin:00000000-0000-0000-0000-000000000001";
const ACTORS: Actor[] = ["system", "webhook", ADMIN];

// Every allowed move, and who may make it. Anything not listed is blocked.
const ALLOWED: Array<[OrderStatus, OrderStatus, Actor[]]> = [
  ["awaiting_payment", "paid", ["system", "webhook"]],
  ["awaiting_payment", "payment_failed", ["system", "webhook", ADMIN]],
  ["awaiting_payment", "expired", ["system", "webhook", ADMIN]],
  ["paid", "renewed", ["system", "webhook", ADMIN]],
  ["paid", "refunded", ["system", "webhook", ADMIN]],
  // money that arrives late still makes the order paid — only from the provider
  ["payment_failed", "paid", ["system", "webhook"]],
  ["expired", "paid", ["system", "webhook"]],
];

const allowedFor = (from: OrderStatus, to: OrderStatus, actor: Actor) =>
  ALLOWED.some(([f, t, actors]) => f === from && t === to && actors.includes(actor));

describe("order status transitions", () => {
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      for (const actor of ACTORS) {
        const expected = allowedFor(from, to, actor);
        it(`${from} -> ${to} by ${actor.startsWith("admin") ? "admin" : actor}: ${expected ? "allowed" : "blocked"}`, () => {
          expect(canTransition(from, to, actor)).toBe(expected);
          if (expected) expect(() => assertTransition(from, to, actor)).not.toThrow();
          else expect(() => assertTransition(from, to, actor)).toThrow(InvalidTransitionError);
        });
      }
    }
  }

  it("an admin can never mark an order paid", () => {
    for (const from of ORDER_STATUSES) expect(canTransition(from, "paid", ADMIN)).toBe(false);
  });
  it("renewed and refunded are final", () => {
    for (const to of ORDER_STATUSES) {
      for (const actor of ACTORS) {
        expect(canTransition("renewed", to, actor)).toBe(false);
        expect(canTransition("refunded", to, actor)).toBe(false);
      }
    }
  });
});
