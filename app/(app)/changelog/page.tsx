import { Suspense } from "react";
import { ChangelogView } from "@/components/changelog-view";

export default function ChangelogPage() {
  return (
    <Suspense fallback={null}>
      <ChangelogView />
    </Suspense>
  );
}
