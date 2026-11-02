import { ALLOWED_MONTHS } from "./config";

/** total = months × monthly price + fee, all whole FCFA. */
export function computeTotal(
  monthlyPriceXaf: number,
  months: number,
  serviceFeeXaf: number,
): number {
  for (const [name, v] of [
    ["monthlyPriceXaf", monthlyPriceXaf],
    ["serviceFeeXaf", serviceFeeXaf],
  ] as const) {
    if (!Number.isSafeInteger(v) || v < 0)
      throw new Error(`${name} must be a whole, non-negative FCFA amount`);
  }
  if (!isAllowedMonths(months)) throw new Error("months must be one of 1, 3, 6, 12");
  return months * monthlyPriceXaf + serviceFeeXaf;
}

export function isAllowedMonths(m: unknown): m is (typeof ALLOWED_MONTHS)[number] {
  return typeof m === "number" && (ALLOWED_MONTHS as readonly number[]).includes(m);
}

/** 12500 -> "12 500 FCFA" */
export function formatXaf(amount: number): string {
  const digits = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${digits} FCFA`;
}
