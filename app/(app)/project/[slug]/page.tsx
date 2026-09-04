import { Suspense } from "react";
import { ProjectPage } from "@/components/project/project-page";

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={null}>
      <ProjectPage slug={params.slug} />
    </Suspense>
  );
}
