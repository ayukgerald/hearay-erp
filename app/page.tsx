import { Suspense } from "react";
import { ChoosePackage } from "./choose-package";

export default function Page() {
  return (
    <Suspense>
      <ChoosePackage />
    </Suspense>
  );
}
