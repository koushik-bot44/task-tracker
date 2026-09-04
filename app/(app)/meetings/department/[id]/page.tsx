import { Suspense } from "react";
import { MeetingsDepartment } from "@/components/meetings/meetings-department";

export default function MeetingsDepartmentPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <MeetingsDepartment departmentId={params.id} />
    </Suspense>
  );
}
