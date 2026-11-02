import { Suspense } from "react";
import { ChooseMonths } from "./choose-months";

export const metadata = { title: "Choose months" };

export default function Page() {
  return (
    <Suspense>
      <ChooseMonths />
    </Suspense>
  );
}
