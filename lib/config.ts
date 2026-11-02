// Central place for configuration read from environment variables.

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

export const config = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get serviceFeeXaf() {
    return int("SERVICE_FEE_XAF", 0);
  },
  get smartcardLengths(): number[] {
    const raw = process.env.SMARTCARD_LENGTHS ?? "10";
    const lengths = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    return lengths.length ? lengths : [10];
  },
  get orderExpiryMinutes() {
    return int("ORDER_EXPIRY_MINUTES", 10);
  },
  get paymentProvider() {
    return (process.env.PAYMENT_PROVIDER ?? "fake").toLowerCase();
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  /**
   * UNSAFE_TEST_MODE=1 allows the fake provider, dev sign-in and the test clock
   * in a production build (for e2e tests in CI). Never honoured on Vercel production.
   */
  get unsafeTestMode() {
    return process.env.UNSAFE_TEST_MODE === "1" && process.env.VERCEL_ENV !== "production";
  },
};

export const ALLOWED_MONTHS = [1, 3, 6, 12] as const;
export type AllowedMonths = (typeof ALLOWED_MONTHS)[number];
