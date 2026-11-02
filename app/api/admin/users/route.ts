import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authMode, requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/auth/supabase";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["owner", "staff"]).default("staff"),
});
const patchSchema = z.object({
  id: z.string().regex(UUID_RE),
  isActive: z.boolean().optional(),
  role: z.enum(["owner", "staff"]).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export const GET = handle(async () => {
  await requireAdmin(["owner"]);
  const users = await db.adminUser.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ users, authMode: authMode() });
});

/** Invite: creates the Supabase Auth user (sends an invite email) and the admin_users row. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(["owner"]);
  const input = inviteSchema.parse(await readJson(req));
  const existing = await db.adminUser.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError("CONFLICT", "Someone with this email is already on the team.");

  let id: string;
  if (authMode() === "dev") {
    id = randomUUID(); // dev mode: signs in with DEV_ADMIN_PASSWORD
  } else {
    const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${config.appUrl}/admin/set-password`,
      data: { name: input.name },
    });
    if (error || !data.user)
      throw new ApiError(
        "CONFLICT",
        `Could not send the invite: ${error?.message ?? "unknown error"}`,
      );
    id = data.user.id;
  }
  const user = await db.adminUser.create({ data: { id, ...input, isActive: true } });
  return NextResponse.json({ user }, { status: 201 });
});

/** Deactivate / reactivate / change role. */
export const PATCH = handle(async (req: Request) => {
  const me = await requireAdmin(["owner"]);
  const { id, ...data } = patchSchema.parse(await readJson(req));
  if (id === me.id && (data.isActive === false || data.role === "staff")) {
    throw new ApiError("CONFLICT", "You cannot deactivate or demote yourself.");
  }
  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) throw new ApiError("NOT_FOUND", "User not found");
  const user = await db.adminUser.update({ where: { id }, data });
  if (authMode() === "supabase" && data.isActive === false) {
    // Also block sign-in at Supabase (getCurrentAdmin already refuses inactive users).
    await supabaseAdmin()
      .auth.admin.updateUserById(id, { ban_duration: "876000h" })
      .catch(() => undefined);
  } else if (authMode() === "supabase" && data.isActive === true) {
    await supabaseAdmin()
      .auth.admin.updateUserById(id, { ban_duration: "none" })
      .catch(() => undefined);
  }
  return NextResponse.json({ user });
});
