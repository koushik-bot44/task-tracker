import { ToolHeader } from "@/components/tool-header";

export default function ToolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return (
    <div className="flex min-h-full flex-col">
      <ToolHeader slug={params.slug} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
