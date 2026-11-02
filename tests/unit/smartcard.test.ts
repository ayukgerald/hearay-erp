import { describe, expect, it } from "vitest";
import { validateSmartcard } from "@/lib/smartcard";

describe("validateSmartcard", () => {
  it("accepts digits of a configured length, ignoring spaces and dashes", () => {
    expect(validateSmartcard("1234567890", [10])).toEqual({ ok: true, value: "1234567890" });
    expect(validateSmartcard("1234 5678 90", [10])).toEqual({ ok: true, value: "1234567890" });
    expect(validateSmartcard("12345-67890", [10, 11])).toEqual({ ok: true, value: "1234567890" });
    expect(validateSmartcard("12345678901", [10, 11])).toEqual({ ok: true, value: "12345678901" });
  });
  it.each([
    ["", "Enter your smartcard number"],
    ["123456789", "must be 10 digits"],
    ["12345678901", "must be 10 digits"],
    ["12345abcde", "only contain digits"],
    ["1234567890.", "only contain digits"],
    ["١٢٣٤٥٦٧٨٩٠", "only contain digits"], // non-ASCII digits
  ])("rejects %j", (input, msg) => {
    const r = validateSmartcard(input, [10]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(msg);
  });
});
