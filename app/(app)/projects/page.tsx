import { Suspense } from "react";
import { ProjectsPage } from "@/components/projects/projects-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectsPage />
    </Suspense>
  );
}
