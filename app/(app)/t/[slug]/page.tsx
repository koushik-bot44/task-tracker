import { Suspense } from "react";
import { ToolTree } from "@/components/tool-tree";

export default function ToolTreePage({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={null}>
      <ToolTree slug={params.slug} />
    </Suspense>
  );
}
