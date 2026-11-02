import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { authMode, getCurrentAdmin } from "@/lib/auth/admin";
import { createDevSessionToken, DEV_COOKIE } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/auth/supabase";
import { db } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/errors";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

/** Who is signed in. */
export const GET = handle(async () => {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError("UNAUTHORIZED", "Not signed in");
  return NextResponse.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });
});

/** Sign in (admin screen A1). */
export const POST = handle(async (req: Request) => {
  const { email, password } = loginSchema.parse(await readJson(req));
  const normalized = email.trim().toLowerCase();
  const bad = () =>
    new ApiError("UNAUTHORIZED", "Wrong email or password, or your account is not active.");

  if (authMode() === "dev") {
    const admin = await db.adminUser.findUnique({ where: { email: normalized } });
    if (!admin?.isActive || password !== (process.env.DEV_ADMIN_PASSWORD ?? "")) throw bad();
    const { token, maxAge } = createDevSessionToken(admin.id);
    (await cookies()).set(DEV_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
    return NextResponse.json({ ok: true, role: admin.role });
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (error || !data.user) throw bad();
  const admin = await db.adminUser.findUnique({ where: { id: data.user.id } });
  if (!admin?.isActive) {
    await supabase.auth.signOut();
    throw bad();
  }
  return NextResponse.json({ ok: true, role: admin.role });
});

/** Sign out. */
export const DELETE = handle(async () => {
  if (authMode() === "dev") {
    (await cookies()).delete(DEV_COOKIE);
  } else {
    await (await supabaseServer()).auth.signOut();
  }
  return NextResponse.json({ ok: true });
});
