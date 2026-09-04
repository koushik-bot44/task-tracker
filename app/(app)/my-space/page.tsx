import { Suspense } from "react";
import { MySpace } from "@/components/my-space/my-space";

export default function MySpacePage() {
  return (
    <Suspense fallback={null}>
      <MySpace />
    </Suspense>
  );
}
