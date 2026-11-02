import { db, OWNER, STAFF } from "./db";

/** Fresh database state: priced, visible packages and one owner + one staff user. */
export default async function globalSetup() {
  if (
    !process.env.E2E_DATABASE_URL &&
    !process.env.TEST_DATABASE_URL &&
    !process.env.DATABASE_URL
  ) {
    throw new Error("Set E2E_DATABASE_URL (or TEST_DATABASE_URL) to a throwaway Postgres database");
  }
  await db.smsMessage.deleteMany();
  await db.orderEvent.deleteMany();
  await db.payment.deleteMany();
  await db.order.deleteMany();
  await db.webhookEvent.deleteMany();
  const prices: Record<string, [string, number, number, string | null]> = {
    family: ["Family", 6500, 10, null],
    compact: ["Compact", 15000, 20, "Most chosen"],
    "compact-plus": ["Compact Plus", 25000, 30, null],
    premium: ["Premium", 38000, 40, null],
  };
  await db.package.updateMany({ data: { isActive: false } });
  for (const [code, [name, price, sortOrder, badge]] of Object.entries(prices)) {
    await db.package.upsert({
      where: { code },
      update: { name, monthlyPriceXaf: price, isActive: true, sortOrder, badge },
      create: { code, name, monthlyPriceXaf: price, isActive: true, sortOrder, badge },
    });
  }
  for (const [u, role] of [
    [OWNER, "owner"],
    [STAFF, "staff"],
  ] as const) {
    await db.adminUser.upsert({
      where: { id: u.id },
      update: { isActive: true, role, email: u.email, name: u.name },
      create: { ...u, role, isActive: true },
    });
  }
  await db.$disconnect();
}
