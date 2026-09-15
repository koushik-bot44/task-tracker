import { Suspense } from "react";
import { NewWorkRecord } from "@/components/work/new-work-record";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NewWorkRecord />
    </Suspense>
  );
}
