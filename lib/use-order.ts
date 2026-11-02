"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "./client";
import type { PublicOrder } from "./order-view";

export type OrderView = Omit<
  PublicOrder,
  "createdAt" | "expiresAt" | "paidAt" | "renewedAt" | "refundedAt"
> & {
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  renewedAt: string | null;
  refundedAt: string | null;
};

/** Polls GET /api/orders/{id} every 3 s until `stop(order)` is true. */
export function useOrder(id: string, stop: (o: OrderView) => boolean, intervalMs = 3000) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const load = useCallback(async (): Promise<OrderView | "gone" | null> => {
    try {
      const o = await api<OrderView>(`/api/orders/${id}`);
      setOrder(o);
      setError(null);
      return o;
    } catch (e) {
      setError(e as ApiClientError);
      return (e as ApiClientError).code === "NOT_FOUND" ? "gone" : null;
    }
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const tick = async () => {
      const o = await load();
      if (cancelled) return;
      if (o === "gone" || (o && stopRef.current(o))) return;
      timer = setTimeout(tick, document.hidden ? intervalMs * 3 : intervalMs);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load, intervalMs]);

  return { order, error, reload: load };
}
