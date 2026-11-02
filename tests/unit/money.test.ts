import { describe, expect, it } from "vitest";
import { computeTotal, formatXaf, isAllowedMonths } from "@/lib/money";

describe("computeTotal", () => {
  it("is months × monthly price + fee", () => {
    expect(computeTotal(12500, 1, 0)).toBe(12500);
    expect(computeTotal(12500, 3, 0)).toBe(37500);
    expect(computeTotal(12500, 6, 200)).toBe(75200);
    expect(computeTotal(5000, 12, 500)).toBe(60500);
  });
  it.each([0, 2, 4, 5, 7, 24, -1, 1.5])("rejects %s months", (m) => {
    expect(() => computeTotal(1000, m, 0)).toThrow();
  });
  it("rejects fractional or negative money", () => {
    expect(() => computeTotal(1000.5, 1, 0)).toThrow();
    expect(() => computeTotal(-1, 1, 0)).toThrow();
    expect(() => computeTotal(1000, 1, -5)).toThrow();
    expect(() => computeTotal(1000, 1, 0.5)).toThrow();
  });
  it("knows the allowed months", () => {
    expect([1, 3, 6, 12].every(isAllowedMonths)).toBe(true);
    expect(isAllowedMonths("3")).toBe(false);
  });
  it("formats FCFA with thin grouping", () => {
    expect(formatXaf(37500)).toBe("37 500 FCFA");
    expect(formatXaf(0)).toBe("0 FCFA");
  });
});
