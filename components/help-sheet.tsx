"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";

/**
 * The one place Orbit is explained in plain words. Opened from your Face
 * menu ("How Orbit works") or by pressing "?" outside a text field.
 */
export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How Orbit works" wide>
      <div className="space-y-5 pb-2 text-sm leading-relaxed text-muted">
        <Concept title="Today is your list">
          What you need to do, latest first. Tick a task when it is done. Meetings for today and tomorrow sit
          underneath — say <strong className="font-medium text-ink">I&apos;ll be there</strong> or{" "}
          <strong className="font-medium text-ink">Can&apos;t</strong> with one tap.
        </Concept>
        <Concept title="Projects have milestones">
          A project is a line of boxes. Each box is a milestone with a review date. Tasks live inside a box; the
          box whose review is next is the one with the blue edge.
        </Concept>
        <Concept title="Add a task in two taps">
          Press the + button, say what needs doing, and it lands in the box with the review date. Tap a face
          only if someone should hold it — they get a message straight away.
        </Concept>
        <Concept title="Reviews are meetings">
          Every review date is a meeting on the Calendar. The evening before, everyone invited gets one message
          with what is due tomorrow and a reply link. If someone can&apos;t make it, the organiser can move it to
          one of the next three working days.
        </Concept>
        <Concept title="How far along is a project">
          The percentage is how many of the project&apos;s tasks are done — nobody types it. After a review the
          CEO says On track or Needs work, and everyone on the project hears the result.
        </Concept>
        <Concept title="Notes go anywhere">
          Every project, milestone and task has a notes thread. Add a photo from your camera or attach a PDF.
        </Concept>
      </div>
    </Sheet>
  );
}

/** Mounts the "?" shortcut once, anywhere. */
export function HelpShortcut() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return <HelpSheet open={open} onClose={() => setOpen(false)} />;
}

function Concept({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-row font-semibold text-ink">{title}</h3>
      <p className="text-sm">{children}</p>
    </section>
  );
}
