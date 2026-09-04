import { Suspense } from "react";
import { TodayPage } from "@/components/today/today-page";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <TodayPage />
    </Suspense>
  );
}
