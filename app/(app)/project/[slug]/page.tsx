import { Suspense } from "react";
import { ProjectTasksPage } from "@/components/project/project-tasks-page";

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={null}>
      <ProjectTasksPage slug={params.slug} />
    </Suspense>
  );
}
