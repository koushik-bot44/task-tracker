import { Suspense } from "react";
import { MeetingsHome } from "@/components/meetings/meetings-home";

export default function MeetingsPage() {
  return (
    <Suspense fallback={null}>
      <MeetingsHome />
    </Suspense>
  );
}
