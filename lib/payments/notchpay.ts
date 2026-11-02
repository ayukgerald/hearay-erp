import { hmacSha256Hex, safeEqualHex, sha256Hex } from "./crypto";
import {
  ProviderUnavailableError,
  type PaymentProvider,
  type ProviderPaymentStatus,
  type ProviderResult,
  type StartCollectionInput,
  type WebhookVerification,
} from "./types";

/**
 * Notch Pay (https://notchpay.co) implementation.
 *
 * !! VERIFY AGAINST THE NOTCH PAY SANDBOX BEFORE GOING LIVE (task 11). !!
 * Written from Notch Pay's public API as documented at developer.notchpay.co;
 * the docs were not reachable from the build environment, so the endpoint
 * paths, header names, channel codes and status strings below are the ones to
 * double-check. They are all kept in this one file on purpose.
 *
 * Flow:
 *   1. POST /payments                 (Authorization: public key) -> transaction.reference
 *   2. POST /payments/{reference}     { channel: "cm.mtn" | "cm.orange", data: { phone } }
 *      -> the customer gets a USSD prompt on their phone
 *   3. Webhook (X-Notch-Signature = HMAC-SHA256(webhook secret, raw body))
 *      and/or GET /payments/{reference} to confirm.
 */
const CHANNELS = { mtn_momo: "cm.mtn", orange_money: "cm.orange" } as const;

export function mapNotchStatus(s: unknown): ProviderPaymentStatus {
  switch (String(s ?? "").toLowerCase()) {
    case "complete":
    case "completed":
    case "success":
    case "successful":
      return "succeeded";
    case "failed":
    case "canceled":
    case "cancelled":
    case "rejected":
    case "refunded":
      return "failed";
    case "expired":
      return "expired";
    default:
      return "pending"; // pending, processing, incomplete, ...
  }
}

type NotchTransaction = {
  reference?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  failure_reason?: string;
  message?: string;
};

export class NotchPayProvider implements PaymentProvider {
  readonly name = "notchpay";
  private base: string;

  constructor(
    private keys: {
      publicKey: string;
      privateKey?: string;
      webhookSecret: string;
      apiUrl?: string;
      fetchImpl?: typeof fetch;
    },
  ) {
    if (!keys.publicKey) throw new Error("NOTCHPAY_PUBLIC_KEY is not set");
    this.base = (keys.apiUrl ?? "https://api.notchpay.co").replace(/\/$/, "");
  }

  private async call(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Authorization: this.keys.publicKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.keys.privateKey) headers["X-Grant"] = this.keys.privateKey;
    let res: Response;
    try {
      res = await (this.keys.fetchImpl ?? fetch)(`${this.base}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderUnavailableError(`Notch Pay unreachable: ${(err as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status >= 500 || res.status === 401 || res.status === 403) {
      throw new ProviderUnavailableError(
        `Notch Pay error ${res.status}: ${json.message ?? ""}`,
        json,
      );
    }
    return { ...json, __httpStatus: res.status };
  }

  async startCollection(input: StartCollectionInput): Promise<ProviderResult> {
    const init = await this.call("/payments", {
      method: "POST",
      body: {
        amount: input.amountXaf,
        currency: "XAF",
        reference: input.merchantReference,
        description: input.description,
        callback: input.callbackUrl,
        phone: input.phone,
        customer: { phone: input.phone },
      },
    });
    const trx = (init.transaction ?? {}) as NotchTransaction;
    const reference = trx.reference;
    if (!reference || Number(init.__httpStatus) >= 400) {
      throw new ProviderUnavailableError(
        `Notch Pay did not create the payment: ${init.message ?? "unknown error"}`,
        init,
      );
    }

    const charge = await this.call(`/payments/${encodeURIComponent(reference)}`, {
      method: "POST",
      body: { channel: CHANNELS[input.method], data: { phone: input.phone } },
    });
    const httpStatus = Number(charge.__httpStatus);
    if (httpStatus >= 400) {
      return {
        providerReference: reference,
        status: "failed",
        failureReason: String(charge.message ?? "The mobile money request was refused"),
        amountXaf: input.amountXaf,
        raw: { init, charge },
      };
    }
    return {
      providerReference: reference,
      status: "pending",
      amountXaf: input.amountXaf,
      raw: { init, charge },
    };
  }

  async getStatus(providerReference: string): Promise<ProviderResult> {
    const json = await this.call(`/payments/${encodeURIComponent(providerReference)}`, {
      method: "GET",
    });
    if (Number(json.__httpStatus) === 404) {
      return {
        providerReference,
        status: "failed",
        failureReason: "Transaction not found at Notch Pay",
        raw: json,
      };
    }
    const trx = (json.transaction ?? {}) as NotchTransaction;
    const status = mapNotchStatus(trx.status);
    return {
      providerReference,
      status,
      failureReason:
        status === "failed" || status === "expired"
          ? (trx.failure_reason ?? trx.message ?? `Payment ${trx.status}`)
          : null,
      amountXaf: trx.amount === undefined ? null : Number(trx.amount),
      raw: json,
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      /* keep null */
    }
    const p = (payload ?? {}) as {
      id?: string;
      event?: string;
      data?: { reference?: string; trxref?: string };
    };
    const sig = headers.get("x-notch-signature") ?? "";
    const valid =
      !!sig &&
      !!this.keys.webhookSecret &&
      safeEqualHex(sig, hmacSha256Hex(this.keys.webhookSecret, rawBody));
    return {
      valid,
      eventId: `notchpay:${p.id ?? sha256Hex(rawBody)}`,
      providerReference: p.data?.reference ?? p.data?.trxref ?? null,
      payload: payload ?? { unparsable: rawBody.slice(0, 2000) },
    };
  }
}
