import { config } from "./config";

/**
 * Server clock. Tests may move it with the X-Test-Now header, but only when
 * ALLOW_TEST_CLOCK=1 and not in production.
 */
export function now(req?: Request): Date {
  if (req && testClockAllowed()) {
    const override = req.headers.get("x-test-now");
    if (override) {
      const d = new Date(override);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

export function testClockAllowed(): boolean {
  return process.env.ALLOW_TEST_CLOCK === "1" && (!config.isProduction || config.unsafeTestMode);
}
