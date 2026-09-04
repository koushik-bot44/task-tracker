"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useMe } from "@/lib/hooks/use-users";
import { isManagerRole } from "@/lib/roles";

/**
 * The manager's read-only rail for a tool's tree and board.
 *
 * This is a SAFETY RAIL, not a permission. A manager keeps every right they
 * had; the server is untouched and will still accept any edit they make. The
 * rail exists because a manager reading a tool is one stray click away from
 * completing someone else's task, and an accidental edit is indistinguishable
 * from a deliberate one after the fact.
 *
 * Leads and developers are unaffected — they are here to work, so they land
 * editable, exactly as before.
 *
 * State is per tool and per session, held in a module-level store rather than
 * localStorage: a reload deliberately returns to read-only. Persisting it
 * would mean a manager could be in edit mode without having chosen it this
 * visit, which is the thing the rail is for.
 */
const editing = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** A stable snapshot: the Set identity is not enough for useSyncExternalStore. */
function snapshotFor(slug: string) {
  return editing.has(slug);
}

export function useEditMode(slug: string) {
  const { data: me } = useMe();

  const isEditing = useSyncExternalStore(
    subscribe,
    () => snapshotFor(slug),
    () => false, // server render: always read-only
  );

  const setEditing = useCallback(
    (next: boolean) => {
      if (next) editing.add(slug);
      else editing.delete(slug);
      emit();
    },
    [slug],
  );

  /* A manager or admin is railed (phase 13, peers): the tree and board open
     read-only, with an explicit Edit toggle, so a stray click never completes
     or moves someone's task. Leads and developers are always editable, and
     `railed` is what the UI branches on so no other role pays for this. */
  const railed = isManagerRole(me?.role);
  return {
    railed,
    canEdit: railed ? isEditing : true,
    isEditing,
    setEditing,
  };
}
