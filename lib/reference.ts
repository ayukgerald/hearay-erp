/** 1048 -> "HR-001048". Grows past 6 digits after 999999 instead of wrapping. */
export function formatReference(n: number | bigint): string {
  const num = typeof n === "bigint" ? n : BigInt(n);
  if (num < 1n) throw new Error("reference number must be >= 1");
  return `HR-${num.toString().padStart(6, "0")}`;
}

type SqlRunner = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

/** Next reference from the Postgres sequence created in the first migration. */
export async function nextReference(db: SqlRunner): Promise<string> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_reference_seq') AS n`;
  return formatReference(rows[0].n);
}
