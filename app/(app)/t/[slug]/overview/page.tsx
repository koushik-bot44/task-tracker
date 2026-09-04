import { ToolOverview } from "@/components/tool-overview";

export default function ToolOverviewPage({ params }: { params: { slug: string } }) {
  return <ToolOverview slug={params.slug} />;
}
