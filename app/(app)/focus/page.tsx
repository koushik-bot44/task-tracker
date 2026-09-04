import { Suspense } from "react";
import { FocusView } from "@/components/focus-view";

export default function FocusPage() {
  return (
    <Suspense fallback={null}>
      <FocusView />
    </Suspense>
  );
}
