/**
 * Runs against a real, THROWAWAY Postgres given in TEST_DATABASE_URL (it
 * deletes all orders). Skipped when TEST_DATABASE_URL is not set.
 * Covers: order creation ignores client totals, webhook idempotency,
 * expiry after 10 minutes, SMS log, and the order_events audit trail.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
if (hasDb) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PAYMENT_PROVIDER = "fake";
process.env.FAKE_PROVIDER_DELAY_MS = "10000";
process.env.FAKE_WEBHOOK_SECRET = "itest-secret";
process.env.ALLOW_TEST_CLOCK = "1";
process.env.DISABLE_RATE_LIMIT = "1";
process.env.CRON_SECRET = "cron-itest";
process.env.SERVICE_FEE_XAF = "0";

describe.skipIf(!hasDb)("order + payment flow (database)", async () => {
  const { db } = await import("@/lib/db");
  const { POST: createOrder } = await import("@/app/api/orders/route");
  const { POST: pay } = await import("@/app/api/orders/[id]/pay/route");
  const { GET: getOrder } = await import("@/app/api/orders/[id]/route");
  const { POST: webhook } = await import("@/app/api/webhooks/[provider]/route");
  const { GET: reconcile } = await import("@/app/api/cron/reconcile/route");
  const { FakeProvider } = await import("@/lib/payments/fake");
  const { transitionOrder } = await import("@/lib/orders");
  const { sendOrderSms } = await import("@/lib/sms");

  let packageId = "";
  const fake = new FakeProvider({ webhookSecret: "itest-secret" });
  const params = <T>(p: T) => ({ params: Promise.resolve(p) });
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://test.local/api", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    });

  async function newOrder(
    over: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) {
    const res = await createOrder(
      json(
        {
          smartcardNumber: "1234567890",
          smartcardConfirm: "1234567890",
          packageId,
          months: 3,
          phone: "677123456",
          paymentMethod: "mtn_momo",
          ...over,
        },
        headers,
      ),
    );
    return { res, body: await res.json() };
  }

  beforeAll(async () => {
    const pkg = await db.package.upsert({
      where: { code: "itest-compact" },
      update: { monthlyPriceXaf: 15000, isActive: true },
      create: {
        code: "itest-compact",
        name: "Compact",
        monthlyPriceXaf: 15000,
        isActive: true,
        sortOrder: 1,
      },
    });
    packageId = pkg.id;
  });

  beforeEach(async () => {
    await db.smsMessage.deleteMany();
    await db.orderEvent.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.webhookEvent.deleteMany();
  });

  it("computes the total on the server and ignores one sent by the browser", async () => {
    const { res, body } = await newOrder({ totalXaf: 1, monthlyPriceXaf: 1, serviceFeeXaf: -100 });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      packageName: "Compact",
      months: 3,
      monthlyPriceXaf: 15000,
      serviceFeeXaf: 0,
      totalXaf: 45000,
      status: "awaiting_payment",
    });
    expect(body.reference).toMatch(/^HR-\d{6,}$/);
    const row = await db.order.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.totalXaf).toBe(45000);
    expect(row.customerPhone).toBe("+237677123456");
  });

  it("returns the listed error codes", async () => {
    expect((await newOrder({ smartcardConfirm: "1234567891" })).body.error.code).toBe(
      "SMARTCARD_MISMATCH",
    );
    expect((await newOrder({ months: 2 })).body.error.code).toBe("VALIDATION_FAILED");
    expect((await newOrder({ phone: "12" })).body.error.code).toBe("VALIDATION_FAILED");
    await db.package.update({ where: { id: packageId }, data: { isActive: false } });
    expect((await newOrder()).body.error.code).toBe("PACKAGE_INACTIVE");
    await db.package.update({ where: { id: packageId }, data: { isActive: true } });
  });

  it("marks the order paid only once when the same webhook arrives twice", async () => {
    const { body: order } = await newOrder();
    const t0 = new Date();
    const payRes = await pay(
      new Request("http://t/pay", { method: "POST", headers: { "x-test-now": t0.toISOString() } }),
      params({ id: order.id }),
    );
    expect(payRes.status).toBe(202);
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });

    const raw = JSON.stringify({
      id: "evt_dup_1",
      event: "payment.complete",
      data: { reference: payment.providerReference },
    });
    const later = new Date(t0.getTime() + 11_000).toISOString();
    const send = () =>
      webhook(
        new Request("http://t/wh", {
          method: "POST",
          body: raw,
          headers: { "x-fake-signature": fake.sign(raw), "x-test-now": later },
        }),
        params({ provider: "fake" }),
      );
    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    const events = await db.orderEvent.findMany({ where: { orderId: order.id, toStatus: "paid" } });
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("webhook");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    expect(await db.webhookEvent.count({ where: { eventId: "fake:evt_dup_1" } })).toBe(1);
    const sms = await db.smsMessage.findMany({ where: { orderId: order.id } });
    expect(sms.map((s) => s.kind)).toEqual(["payment_received"]);
    expect(sms[0].body).toContain(order.reference);
  });

  it("rejects a webhook with a bad signature but keeps it for review", async () => {
    const raw = JSON.stringify({ id: "evt_bad", data: { reference: "x" } });
    const res = await webhook(
      new Request("http://t/wh", {
        method: "POST",
        body: raw,
        headers: { "x-fake-signature": "deadbeef" },
      }),
      params({ provider: "fake" }),
    );
    expect(res.status).toBe(401);
    const stored = await db.webhookEvent.findFirstOrThrow({ where: { signatureValid: false } });
    expect(stored.eventId).toContain("evt_bad");
  });

  it("does not trust the webhook body: a 'complete' event before the provider confirms changes nothing", async () => {
    const { body: order } = await newOrder();
    const t0 = new Date();
    await pay(
      new Request("http://t/pay", { method: "POST", headers: { "x-test-now": t0.toISOString() } }),
      params({ id: order.id }),
    );
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    const raw = JSON.stringify({
      id: "evt_early",
      event: "payment.complete",
      data: { reference: payment.providerReference },
    });
    await webhook(
      new Request("http://t/wh", {
        method: "POST",
        body: raw,
        headers: {
          "x-fake-signature": fake.sign(raw),
          "x-test-now": new Date(t0.getTime() + 2_000).toISOString(),
        },
      }),
      params({ provider: "fake" }),
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "awaiting_payment",
    );
  });

  it("customer status polling confirms with the provider; failed payments fail the order", async () => {
    const { body: order } = await newOrder({ phone: "677123450" }); // ends in 0 -> fake fails
    const t0 = new Date();
    await pay(
      new Request("http://t/pay", { method: "POST", headers: { "x-test-now": t0.toISOString() } }),
      params({ id: order.id }),
    );
    const res = await getOrder(
      new Request("http://t/o", {
        headers: { "x-test-now": new Date(t0.getTime() + 5_000).toISOString() },
      }),
      params({ id: order.id }),
    );
    const view = await res.json();
    expect(view.status).toBe("payment_failed");
    expect(view.failureReason).toMatch(/declined/);
    // Paying a failed order is refused
    const again = await pay(
      new Request("http://t/pay", { method: "POST" }),
      params({ id: order.id }),
    );
    expect((await again.json()).error.code).toBe("ORDER_NOT_PAYABLE");
  });

  it("expires an unpaid order after 10 minutes via reconcile", async () => {
    const { body: order } = await newOrder({ phone: "677123459" });
    const created = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).createdAt;
    const at = (min: number) => new Date(created.getTime() + min * 60_000).toISOString();
    const run = (min: number) =>
      reconcile(
        new Request("http://t/cron", {
          headers: { authorization: "Bearer cron-itest", "x-test-now": at(min) },
        }),
      );

    expect((await run(9.9).then((r) => r.json())).ordersExpired).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "awaiting_payment",
    );
    expect((await run(10.1).then((r) => r.json())).ordersExpired).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("expired");
    expect((await reconcile(new Request("http://t/cron"))).status).toBe(401);
  });

  it("transitionOrder writes an audit row and the renewed SMS is logged", async () => {
    const { body: order } = await newOrder();
    await transitionOrder(order.id, "paid", "system");
    await sendOrderSms(order.id, "payment_received");
    await expect(transitionOrder(order.id, "paid", "system")).rejects.toThrow();
    await transitionOrder(order.id, "renewed", "admin:00000000-0000-0000-0000-000000000000", {
      note: "agent rcpt 991",
    });
    await sendOrderSms(order.id, "renewed");
    await sendOrderSms(order.id, "renewed"); // not sent twice
    const events = await db.orderEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "null->awaiting_payment",
      "awaiting_payment->paid",
      "paid->renewed",
    ]);
    const sms = await db.smsMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(sms.map((s) => [s.kind, s.status])).toEqual([
      ["payment_received", "sent"],
      ["renewed", "sent"],
    ]);
  });
});
