import { describe, expect, it } from "vitest";
import { formatReference, nextReference } from "@/lib/reference";

describe("order references", () => {
  it("formats HR-000001 upward", () => {
    expect(formatReference(1)).toBe("HR-000001");
    expect(formatReference(1048)).toBe("HR-001048");
    expect(formatReference(999999)).toBe("HR-999999");
    expect(formatReference(1000000)).toBe("HR-1000000");
    expect(formatReference(42n)).toBe("HR-000042");
  });
  it("refuses zero and negatives", () => {
    expect(() => formatReference(0)).toThrow();
    expect(() => formatReference(-3)).toThrow();
  });
  it("takes the number from the database sequence", async () => {
    const fake = { $queryRaw: async () => [{ n: 7n }] } as never;
    expect(await nextReference(fake)).toBe("HR-000007");
  });
});
