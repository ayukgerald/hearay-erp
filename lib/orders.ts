import type { Order, OrderStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { assertTransition, type Actor, InvalidTransitionError } from "./order-status";

type Tx = Prisma.TransactionClient;

export class OrderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderConflictError";
  }
}

/**
 * The ONLY way an order's status may change. Checks the move is allowed,
 * updates the row only if it is still in the expected state (so two
 * concurrent callers cannot both apply a move), and writes an order_events row.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  opts: {
    note?: string | null;
    data?: Omit<Prisma.OrderUncheckedUpdateManyInput, "status">;
    tx?: Tx;
  } = {},
): Promise<Order> {
  const run = async (tx: Tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId } });
    if (!current) throw new OrderConflictError("Order not found");
    assertTransition(current.status, to, actor);

    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { ...opts.data, status: to },
    });
    if (count !== 1) throw new OrderConflictError("Order changed while updating, try again");

    await tx.orderEvent.create({
      data: { orderId, fromStatus: current.status, toStatus: to, actor, note: opts.note ?? null },
    });
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  };
  return opts.tx ? run(opts.tx) : db.$transaction(run);
}

export { InvalidTransitionError };
