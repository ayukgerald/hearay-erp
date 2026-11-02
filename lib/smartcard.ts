export type SmartcardResult = { ok: true; value: string } | { ok: false; reason: string };

/** Digits only (spaces and dashes typed by the customer are removed), length from config. */
export function validateSmartcard(input: string, allowedLengths: number[]): SmartcardResult {
  if (typeof input !== "string") return { ok: false, reason: "Enter your smartcard number" };
  const value = input.replace(/[\s-]/g, "");
  if (!value) return { ok: false, reason: "Enter your smartcard number" };
  if (!/^\d+$/.test(value))
    return { ok: false, reason: "Smartcard number can only contain digits" };
  if (!allowedLengths.includes(value.length)) {
    const want = allowedLengths.join(" or ");
    return { ok: false, reason: `Smartcard number must be ${want} digits` };
  }
  return { ok: true, value };
}
