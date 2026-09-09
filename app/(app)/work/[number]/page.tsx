import { Suspense } from "react";
import { WorkRecord } from "@/components/work/work-record";

export default function Page({ params }: { params: { number: string } }) {
  return (
    <Suspense fallback={null}>
      <WorkRecord number={params.number} />
    </Suspense>
  );
}
