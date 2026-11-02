/**
 * Cameroon phone numbers: country code 237 + 9-digit national number.
 * Mobile numbers (the only ones that can pay with mobile money) start with 6.
 */
export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: string };

export function normalizeCameroonPhone(input: string): PhoneResult {
  if (typeof input !== "string") return { ok: false, reason: "Enter a phone number" };
  const trimmed = input.trim().replace(/[()]/g, "").trim();
  if (!trimmed) return { ok: false, reason: "Enter a phone number" };
  if (/[^\d\s+().-]/.test(trimmed))
    return { ok: false, reason: "Phone number can only contain digits" };
  if (trimmed.indexOf("+") > 0 || (trimmed.match(/\+/g) ?? []).length > 1)
    return { ok: false, reason: "Phone number is not valid" };

  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (!digits.startsWith("237"))
      return { ok: false, reason: "Only Cameroon (+237) numbers are supported" };
    digits = digits.slice(3);
  } else if (digits.startsWith("00237")) {
    digits = digits.slice(5);
  } else if (digits.length === 12 && digits.startsWith("237")) {
    digits = digits.slice(3);
  }

  if (digits.length !== 9)
    return { ok: false, reason: "Enter the 9-digit number, e.g. 6XX XX XX XX" };
  if (!digits.startsWith("6")) return { ok: false, reason: "Use a mobile number starting with 6" };
  return { ok: true, e164: `+237${digits}` };
}

/** +237677123456 -> "+237 6 77 12 34 56"-ish friendly display. */
export function formatPhone(e164: string): string {
  const m = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+237 ${m[1]}${m[2]} ${m[3]} ${m[4]} ${m[5]}` : e164;
}

/** +237677123456 -> "+237 6•• •• 34 56" */
export function maskPhone(e164: string): string {
  const m = /^\+237(\d)\d{2}\d{2}(\d{2})(\d{2})$/.exec(e164);
  return m ? `+237 ${m[1]}•• •• ${m[2]} ${m[3]}` : e164;
}
