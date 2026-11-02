/**
 * Seeds the four DStv packages (price 0, hidden until real prices are entered)
 * and, if SEED_OWNER_EMAIL is set, the first owner account.
 * Safe to run more than once: it never overwrites prices an admin has set.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const db = new PrismaClient();

const PACKAGES = [
  { code: "family", name: "Family", sortOrder: 10, badge: null },
  { code: "compact", name: "Compact", sortOrder: 20, badge: "Most chosen" },
  { code: "compact-plus", name: "Compact Plus", sortOrder: 30, badge: null },
  { code: "premium", name: "Premium", sortOrder: 40, badge: null },
];

async function seedOwner() {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) return;
  const name = process.env.SEED_OWNER_NAME?.trim() || "Owner";
  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`owner ${email} already exists`);
    return;
  }

  let id: string = randomUUID();
  if ((process.env.AUTH_MODE ?? "supabase") === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const password = process.env.SEED_OWNER_PASSWORD;
    if (!url || !key || !password) {
      throw new Error(
        "Supabase mode: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_OWNER_PASSWORD to create the owner",
      );
    }
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) throw new Error(`Could not create Supabase user: ${error?.message}`);
    id = data.user.id;
  }
  await db.adminUser.create({ data: { id, email, name, role: "owner", isActive: true } });
  console.log(`created owner ${email}`);
}

async function main() {
  for (const p of PACKAGES) {
    await db.package.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, monthlyPriceXaf: 0, isActive: false },
    });
  }
  console.log(`packages: ${await db.package.count()} in table`);
  await seedOwner();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
