import { Suspense } from "react";
import { WorkPage } from "@/components/work/work-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkPage />
    </Suspense>
  );
}
