import { randomBytes } from "node:crypto";
import { hmacSha256Hex, safeEqualHex, sha256Hex } from "./crypto";
import type {
  PaymentProvider,
  ProviderResult,
  StartCollectionInput,
  WebhookVerification,
} from "./types";

/**
 * Local stand-in for a mobile money aggregator.
 *  - succeeds FAKE_PROVIDER_DELAY_MS (default 10 s) after starting
 *  - fails when the phone number ends in 0 (after a short delay, so the
 *    "approve on your phone" screen is visible for a moment)
 * It is stateless: the start time and outcome are encoded in the reference.
 * Webhooks are signed with HMAC-SHA256(FAKE_WEBHOOK_SECRET, body) in X-Fake-Signature.
 */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake";

  constructor(private opts: { delayMs?: number; webhookSecret?: string } = {}) {}

  private get delayMs() {
    return this.opts.delayMs ?? Number(process.env.FAKE_PROVIDER_DELAY_MS ?? 10_000);
  }

  private get secret() {
    return this.opts.webhookSecret ?? process.env.FAKE_WEBHOOK_SECRET ?? "change-me";
  }

  async startCollection(input: StartCollectionInput, o?: { now?: Date }): Promise<ProviderResult> {
    const startedAt = (o?.now ?? new Date()).getTime();
    const outcome = input.phone.endsWith("0") ? "f" : "s";
    const ref = `fake_${startedAt}_${outcome}_${input.amountXaf}_${randomBytes(4).toString("hex")}`;
    return {
      providerReference: ref,
      status: "pending",
      amountXaf: input.amountXaf,
      raw: {
        fake: true,
        reference: ref,
        merchantReference: input.merchantReference,
        status: "pending",
      },
    };
  }

  async getStatus(providerReference: string, o?: { now?: Date }): Promise<ProviderResult> {
    const m = /^fake_(\d+)_([sf])_(\d+)_[0-9a-f]+$/.exec(providerReference);
    if (!m) {
      return {
        providerReference,
        status: "failed",
        failureReason: "Unknown transaction",
        raw: { fake: true },
      };
    }
    const elapsed = (o?.now ?? new Date()).getTime() - Number(m[1]);
    const amountXaf = Number(m[3]);
    let status: ProviderResult["status"] = "pending";
    let failureReason: string | null = null;
    if (m[2] === "f" && elapsed >= Math.min(3_000, this.delayMs)) {
      status = "failed";
      failureReason = "The payment was declined (test number ending in 0)";
    } else if (m[2] === "s" && elapsed >= this.delayMs) {
      status = "succeeded";
    }
    return {
      providerReference,
      status,
      failureReason,
      amountXaf,
      raw: { fake: true, status, elapsed },
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      /* stored as null payload below */
    }
    const p = (payload ?? {}) as { id?: string; data?: { reference?: string } };
    const sig = headers.get("x-fake-signature") ?? "";
    const valid = !!sig && safeEqualHex(sig, hmacSha256Hex(this.secret, rawBody));
    return {
      valid,
      eventId: `fake:${p.id ?? sha256Hex(rawBody)}`,
      providerReference: p.data?.reference ?? null,
      payload: payload ?? { unparsable: rawBody.slice(0, 2000) },
    };
  }

  /** Helper for tests and curl examples. */
  sign(rawBody: string): string {
    return hmacSha256Hex(this.secret, rawBody);
  }
}
