import { Suspense } from "react";
import { MeetingsProject } from "@/components/meetings/meetings-project";

export default function MeetingsProjectPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <MeetingsProject projectId={params.id} />
    </Suspense>
  );
}
