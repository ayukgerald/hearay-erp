import { getCurrentAdmin } from "@/lib/auth/admin";
import { OwnerOnly } from "../owner-only";
import { PackagesEditor } from "./packages-editor";

export const metadata = { title: "Packages & prices" };

/** A3 — owner edits prices, hides or reorders packages. */
export default async function Page() {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "owner") return <OwnerOnly />;
  return <PackagesEditor />;
}
