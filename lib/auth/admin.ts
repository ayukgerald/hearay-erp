import type { AdminRole, AdminUser } from "@prisma/client";
import { cookies } from "next/headers";
import { config } from "../config";
import { db } from "../db";
import { ApiError } from "../errors";
import { DEV_COOKIE, readDevSessionToken } from "./session";
import { supabaseServer } from "./supabase";

export type AuthMode = "supabase" | "dev";

export function authMode(): AuthMode {
  const mode = (process.env.AUTH_MODE ?? "supabase").toLowerCase();
  if (mode === "dev") {
    if (config.isProduction && !config.unsafeTestMode) {
      throw new Error("AUTH_MODE=dev is not allowed in production");
    }
    return "dev";
  }
  return "supabase";
}

/** The signed-in, active admin user, or null. */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  let id: string | null = null;
  if (authMode() === "dev") {
    id = readDevSessionToken((await cookies()).get(DEV_COOKIE)?.value);
  } else {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    id = data.user?.id ?? null;
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = await db.adminUser.findUnique({ where: { id } });
  return admin?.isActive ? admin : null;
}

/** Throws 401/403 unless the current admin has one of the roles. Owners can do everything staff can. */
export async function requireAdmin(roles: AdminRole[] = ["owner", "staff"]): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError("UNAUTHORIZED", "Please sign in");
  if (!roles.includes(admin.role)) throw new ApiError("FORBIDDEN", "Only the owner can do this");
  return admin;
}
