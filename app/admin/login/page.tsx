import { redirect } from "next/navigation";
import { authMode, getCurrentAdmin } from "@/lib/auth/admin";
import { LoginForm } from "./login-form";

export const metadata = { title: "Staff sign in" };
export const dynamic = "force-dynamic";

/** A1 — staff sign in. */
export default async function Page() {
  if (await getCurrentAdmin()) redirect("/admin/orders");
  return <LoginForm devMode={authMode() === "dev"} />;
}
