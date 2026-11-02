import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/errors";
import { OrderConflictError } from "@/lib/orders";
import { getProviderByName, ProviderUnavailableError } from "@/lib/payments";
import { applyProviderResult } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/**
 * Aggregator callback. Steps: verify signature -> store in webhook_events ->
 * skip if already processed -> confirm with the provider's status API (the
 * webhook body itself is never trusted for the outcome) -> update payment/order.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider: name } = await ctx.params;
  const provider = getProviderByName(name);
  if (!provider) throw new ApiError("NOT_FOUND", "Unknown provider");

  const raw = await req.text();
  const v = provider.verifyWebhook(raw, req.headers);
  const payload = v.payload as Prisma.InputJsonValue;

  if (!v.valid) {
    // Kept for review under a unique id so a forged event can never block the real one.
    await db.webhookEvent.create({
      data: {
        provider: provider.name,
        eventId: `invalid:${randomUUID()}:${v.eventId}`,
        signatureValid: false,
        payload,
      },
    });
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Bad signature" } },
      { status: 401 },
    );
  }

  let event;
  try {
    event = await db.webhookEvent.create({
      data: { provider: provider.name, eventId: v.eventId, signatureValid: true, payload },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    event = await db.webhookEvent.findUniqueOrThrow({ where: { eventId: v.eventId } });
    if (event.processedAt) return NextResponse.json({ ok: true, duplicate: true });
    // Stored but never finished (e.g. crashed or provider was down): process again.
  }

  const markProcessed = () =>
    db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });

  const payment = v.providerReference
    ? await db.payment.findUnique({ where: { providerReference: v.providerReference } })
    : null;
  if (!payment) {
    await markProcessed();
    return NextResponse.json({ ok: true, ignored: "unknown transaction" });
  }

  try {
    const confirmed = await provider.getStatus(payment.providerReference, { now: now(req) });
    if (!(confirmed.status === "pending" && payment.status === "pending")) {
      await applyProviderResult(payment.id, confirmed, "webhook");
    }
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      // Leave unprocessed and ask the aggregator to retry later; reconcile also covers it.
      return NextResponse.json(
        { error: { code: "PROVIDER_UNAVAILABLE", message: err.message } },
        { status: 503 },
      );
    }
    if (!(err instanceof OrderConflictError)) throw err; // a concurrent duplicate already applied it
  }
  await markProcessed();
  return NextResponse.json({ ok: true });
});
