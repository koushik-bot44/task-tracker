import { Suspense } from "react";
import { DepartmentOverview } from "@/components/department-overview";

export default function DepartmentPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <DepartmentOverview departmentId={params.id} />
    </Suspense>
  );
}
