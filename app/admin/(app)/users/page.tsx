import { getCurrentAdmin } from "@/lib/auth/admin";
import { OwnerOnly } from "../owner-only";
import { StaffManager } from "./staff-manager";

export const metadata = { title: "Staff" };

/** A4 — owner invites or deactivates staff. */
export default async function Page() {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "owner") return <OwnerOnly />;
  return <StaffManager meId={admin.id} />;
}
