import { MentorGate } from "@/components/routine/mentor-screen";

export const dynamic = "force-dynamic";

/** The tutor's / coach's door: a walled login lands here and the gate sends the
    son to /person, a co-parent to /family, and anyone else to the login. */
export default function Page() {
  return <MentorGate />;
}
