"use client";

import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjectBySlug } from "@/lib/hooks/use-projects";
import { TreeView } from "@/components/tree/tree-view";

export function ToolTree({ slug }: { slug: string }) {
  const { project, isLoading } = useProjectBySlug(slug);
  const { rootId } = usePanelParams();

  if (!project) {
    return isLoading ? null : (
      <p className="px-5 py-16 text-center text-sm text-muted">
        No project with that address.
      </p>
    );
  }

  return <TreeView key={project.id} project={project} rootId={rootId} />;
}
