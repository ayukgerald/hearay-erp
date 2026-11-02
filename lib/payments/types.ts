import type { PaymentMethod } from "@prisma/client";

/** Status as reported by a provider, mapped onto our payment_status values. */
export type ProviderPaymentStatus = "pending" | "succeeded" | "failed" | "expired";

export interface StartCollectionInput {
  /** Our own unique reference for this attempt, e.g. HR-001048-2 */
  merchantReference: string;
  amountXaf: number;
  /** E.164, e.g. +237677123456 */
  phone: string;
  method: PaymentMethod;
  description: string;
  /** Where the provider should POST webhooks */
  callbackUrl: string;
}

export interface ProviderResult {
  providerReference: string;
  status: ProviderPaymentStatus;
  failureReason?: string | null;
  /** Amount the provider says it collected/requested, when it reports one. */
  amountXaf?: number | null;
  raw: unknown;
}

export interface WebhookVerification {
  valid: boolean;
  /** Idempotency key; falls back to a hash of the body when the provider sends none. */
  eventId: string;
  /** The provider transaction this event is about, when it could be read. */
  providerReference: string | null;
  payload: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  startCollection(input: StartCollectionInput, opts?: { now?: Date }): Promise<ProviderResult>;
  getStatus(providerReference: string, opts?: { now?: Date }): Promise<ProviderResult>;
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification;
}

/** Thrown when the provider cannot be reached or rejects the call outright. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    public raw?: unknown,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
