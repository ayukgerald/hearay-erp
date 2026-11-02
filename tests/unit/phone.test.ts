import { describe, expect, it } from "vitest";
import { maskPhone, normalizeCameroonPhone } from "@/lib/phone";

describe("normalizeCameroonPhone", () => {
  it.each([
    ["677123456", "+237677123456"],
    ["6 77 12 34 56", "+237677123456"],
    ["677-12-34-56", "+237677123456"],
    ["+237677123456", "+237677123456"],
    ["+237 6 77 12 34 56", "+237677123456"],
    ["237677123456", "+237677123456"],
    ["00237677123456", "+237677123456"],
    ["(+237) 655 12 34 56", "+237655123456"],
    ["  699000111 ", "+237699000111"],
  ])("normalises %s", (input, want) => {
    expect(normalizeCameroonPhone(input)).toEqual({ ok: true, e164: want });
  });

  it.each([
    [""],
    ["   "],
    ["67712345"], // 8 digits
    ["6771234567"], // 10 digits
    ["277123456"], // landline, cannot pay with mobile money
    ["+33612345678"], // France
    ["+2346771234567"],
    ["67712345a"],
    ["6771+23456"],
    ["++237677123456"],
    ["0677123456"],
  ])("rejects %j", (input) => {
    const r = normalizeCameroonPhone(input);
    expect(r.ok).toBe(false);
  });

  it("masks for display", () => {
    expect(maskPhone("+237677123456")).toBe("+237 6•• •• 34 56");
  });
});
