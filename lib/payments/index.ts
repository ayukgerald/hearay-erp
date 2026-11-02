import { config } from "../config";
import { FakeProvider } from "./fake";
import { NotchPayProvider } from "./notchpay";
import type { PaymentProvider } from "./types";

export * from "./types";

/** Every provider the app knows, by name (used for webhooks and stored payments). */
export function getProviderByName(name: string): PaymentProvider | null {
  switch (name) {
    case "fake":
      if (config.isProduction && !config.unsafeTestMode) return null;
      return new FakeProvider();
    case "notchpay":
      return new NotchPayProvider({
        publicKey: process.env.NOTCHPAY_PUBLIC_KEY ?? "",
        privateKey: process.env.NOTCHPAY_PRIVATE_KEY || undefined,
        webhookSecret: process.env.NOTCHPAY_WEBHOOK_SECRET ?? "",
        apiUrl: process.env.NOTCHPAY_API_URL || undefined,
      });
    // case "campay": fallback provider — implement PaymentProvider and add it here.
    default:
      return null;
  }
}

/** The provider new payments go to. Switched with PAYMENT_PROVIDER. */
export function getPaymentProvider(): PaymentProvider {
  const p = getProviderByName(config.paymentProvider);
  if (!p) throw new Error(`Unknown or disabled PAYMENT_PROVIDER "${config.paymentProvider}"`);
  return p;
}
