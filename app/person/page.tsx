import { PersonGate } from "@/components/routine/person-screen";

export const dynamic = "force-dynamic";

/** The walled family area's front door: the gate asks who this login is and
    shows the son his screen, or sends a co-parent to /family, a tutor to /mentor. */
export default function Page() {
  return <PersonGate />;
}
