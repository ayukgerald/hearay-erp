import { Suspense } from "react";
import { PayForm } from "./pay-form";

export const metadata = { title: "Pay" };

export default function Page() {
  return (
    <Suspense>
      <PayForm />
    </Suspense>
  );
}
