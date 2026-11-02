import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="min-h-dvh">
      <AdminNav name={admin.name} role={admin.role} />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
