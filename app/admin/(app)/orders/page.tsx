import { getCurrentAdmin } from "@/lib/auth/admin";
import { OrdersQueue } from "./orders-queue";

export const metadata = { title: "Orders to fulfil" };

/** A2 — paid orders oldest first; staff renew on the DStv agent portal, then Mark renewed. */
export default async function Page() {
  const admin = await getCurrentAdmin();
  return <OrdersQueue isOwner={admin?.role === "owner"} />;
}
