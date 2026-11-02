import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeProvider } from "@/lib/payments/fake";
import { getPaymentProvider } from "@/lib/payments";
import { mapNotchStatus, NotchPayProvider } from "@/lib/payments/notchpay";
import { hmacSha256Hex } from "@/lib/payments/crypto";

const input = {
  merchantReference: "HR-000001-1",
  amountXaf: 37500,
  phone: "+237677123456",
  method: "mtn_momo" as const,
  description: "test",
  callbackUrl: "http://localhost/api/webhooks/fake",
};

describe("FakeProvider", () => {
  const fake = new FakeProvider({ delayMs: 10_000, webhookSecret: "s3cret" });
  const t0 = new Date("2026-11-02T10:00:00Z");
  const at = (ms: number) => ({ now: new Date(t0.getTime() + ms) });

  it("is pending, then succeeds 10 seconds after starting", async () => {
    const started = await fake.startCollection(input, { now: t0 });
    expect(started.status).toBe("pending");
    expect((await fake.getStatus(started.providerReference, at(9_999))).status).toBe("pending");
    const done = await fake.getStatus(started.providerReference, at(10_000));
    expect(done.status).toBe("succeeded");
    expect(done.amountXaf).toBe(37500);
  });

  it("fails when the phone ends in 0", async () => {
    const started = await fake.startCollection({ ...input, phone: "+237677123450" }, { now: t0 });
    expect((await fake.getStatus(started.providerReference, at(1_000))).status).toBe("pending");
    const r = await fake.getStatus(started.providerReference, at(60_000));
    expect(r.status).toBe("failed");
    expect(r.failureReason).toBeTruthy();
  });

  it("treats unknown references as failed", async () => {
    expect((await fake.getStatus("nope")).status).toBe("failed");
  });

  it("verifies webhook signatures", () => {
    const body = JSON.stringify({
      id: "evt_1",
      event: "payment.complete",
      data: { reference: "fake_1" },
    });
    const good = fake.verifyWebhook(body, new Headers({ "x-fake-signature": fake.sign(body) }));
    expect(good).toMatchObject({ valid: true, eventId: "fake:evt_1", providerReference: "fake_1" });
    expect(fake.verifyWebhook(body, new Headers({ "x-fake-signature": "00" })).valid).toBe(false);
    expect(fake.verifyWebhook(body, new Headers()).valid).toBe(false);
    expect(
      fake.verifyWebhook(body + " ", new Headers({ "x-fake-signature": fake.sign(body) })).valid,
    ).toBe(false);
  });
});

describe("provider switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses PAYMENT_PROVIDER", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "fake");
    expect(getPaymentProvider().name).toBe("fake");
    vi.stubEnv("PAYMENT_PROVIDER", "notchpay");
    vi.stubEnv("NOTCHPAY_PUBLIC_KEY", "pk_test");
    expect(getPaymentProvider().name).toBe("notchpay");
    vi.stubEnv("PAYMENT_PROVIDER", "nonsense");
    expect(() => getPaymentProvider()).toThrow();
  });
  it("refuses the fake provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "fake");
    expect(() => getPaymentProvider()).toThrow();
  });
});

describe("NotchPayProvider", () => {
  it("maps statuses", () => {
    expect(mapNotchStatus("complete")).toBe("succeeded");
    expect(mapNotchStatus("failed")).toBe("failed");
    expect(mapNotchStatus("canceled")).toBe("failed");
    expect(mapNotchStatus("expired")).toBe("expired");
    expect(mapNotchStatus("pending")).toBe("pending");
    expect(mapNotchStatus(undefined)).toBe("pending");
  });

  it("initialises then charges the right channel", async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: init.body ? JSON.parse(String(init.body)) : null,
        auth: new Headers(init.headers).get("authorization"),
      });
      if (calls.length === 1)
        return Response.json({ transaction: { reference: "trx.abc" } }, { status: 201 });
      return Response.json({ status: "Accepted", code: 202 }, { status: 202 });
    }) as unknown as typeof fetch;
    const np = new NotchPayProvider({ publicKey: "pk", webhookSecret: "wh", fetchImpl });
    const r = await np.startCollection({ ...input, method: "orange_money" });
    expect(r).toMatchObject({ providerReference: "trx.abc", status: "pending" });
    expect(calls[0].url).toBe("https://api.notchpay.co/payments");
    expect(calls[0].body).toMatchObject({
      amount: 37500,
      currency: "XAF",
      reference: "HR-000001-1",
    });
    expect(calls[0].auth).toBe("pk");
    expect(calls[1].url).toBe("https://api.notchpay.co/payments/trx.abc");
    expect(calls[1].body).toEqual({ channel: "cm.orange", data: { phone: "+237677123456" } });
  });

  it("reports the provider as unavailable on 5xx", async () => {
    const fetchImpl = (async () =>
      Response.json({ message: "down" }, { status: 502 })) as unknown as typeof fetch;
    const np = new NotchPayProvider({ publicKey: "pk", webhookSecret: "wh", fetchImpl });
    await expect(np.startCollection(input)).rejects.toThrow(/unavailable|error 502/i);
  });

  it("verifies X-Notch-Signature", () => {
    const np = new NotchPayProvider({ publicKey: "pk", webhookSecret: "wh" });
    const body = JSON.stringify({
      id: "evt_9",
      event: "payment.complete",
      data: { reference: "trx.abc" },
    });
    const v = np.verifyWebhook(
      body,
      new Headers({ "x-notch-signature": hmacSha256Hex("wh", body) }),
    );
    expect(v).toMatchObject({
      valid: true,
      eventId: "notchpay:evt_9",
      providerReference: "trx.abc",
    });
    expect(
      np.verifyWebhook(body, new Headers({ "x-notch-signature": hmacSha256Hex("other", body) }))
        .valid,
    ).toBe(false);
  });
});
