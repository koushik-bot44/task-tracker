/* Pure logic: no server, no database (2026-09-11).
 *   TZ=UTC npx tsx scripts/check-logic.ts            (the zone the server runs in)
 *   TZ=Asia/Kolkata npx tsx scripts/check-logic.ts   (a laptop in India: must say the same)
 *
 * The state machine as rules rather than a copy of its table: nothing moves to
 * itself; everything open can be cancelled; only work done is resolved; only
 * resolved work closes; finished work comes back only through Reopened; every
 * state can be reached from New and can reach a finished state. The status each
 * state shows, what a move needs, what giving or taking away a holder does, and
 * that every path the old status sheet takes is a chain of allowed moves ending
 * on that status. Time: the IST day at midnight and across month, year and
 * leap-day ends, and the edges of a day's range for every day of 2026–2028,
 * whatever zone the process runs in.
 */
import { FINISHED, OPEN, TRANSITIONS, canTransition, isFinished, pathToStatus, stateAfterAssignment, statusOf, transitionNeeds } from "../lib/work/workflow";
import { istDayKey, istDayRange } from "../lib/timezone";
import type { TaskStatus, WorkState } from "../lib/types";

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const note = (text: string) => console.log(`NOTE  ${text}`);
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const STATES = Object.keys(TRANSITIONS) as WorkState[];
const STATUSES: TaskStatus[] = ["TODO", "DOING", "STUCK", "DONE"];

/* ---- the state machine, as rules ---- */
record("there are nine states", STATES.length === 9, STATES.join(" "));
record("open and finished split the states, with no overlap", OPEN.length + FINISHED.length === STATES.length && STATES.every((s) => OPEN.includes(s) !== FINISHED.includes(s)));
record("isFinished agrees with the finished list", STATES.every((s) => isFinished(s) === FINISHED.includes(s)));
record("canTransition agrees with the table for all 81 pairs", STATES.every((a) => STATES.every((b) => canTransition(a, b) === TRANSITIONS[a].includes(b))));
record("nothing moves to itself", STATES.every((s) => !canTransition(s, s)));
record("everything open can be cancelled in one move", OPEN.every((s) => canTransition(s, "CANCELLED")));
const into = (to: WorkState) => STATES.filter((s) => canTransition(s, to));
record("only work in progress or escalated work is resolved", same(into("RESOLVED"), ["IN_PROGRESS", "ESCALATED"]), into("RESOLVED").join(", "));
record("only resolved work is closed", same(into("CLOSED"), ["RESOLVED"]), into("CLOSED").join(", "));
record("only work in progress goes on hold", same(into("WAITING"), ["IN_PROGRESS"]), into("WAITING").join(", "));
record(
  "finished work comes back only through Reopened (and resolved work may close)",
  FINISHED.every((s) => TRANSITIONS[s].every((t) => t === "REOPENED" || (s === "RESOLVED" && t === "CLOSED"))),
);
const reach = (from: WorkState) => {
  const seen = new Set<WorkState>([from]);
  const queue: WorkState[] = [from];
  while (queue.length) for (const next of TRANSITIONS[queue.shift()!]) if (!seen.has(next)) (seen.add(next), queue.push(next));
  return seen;
};
record("every state can be reached from New", same([...reach("NEW")], STATES), [...reach("NEW")].join(" "));
record("from every state some finished state can be reached", STATES.every((s) => [...reach(s)].some(isFinished)));

/* ---- the status each state shows ---- */
const SHOWS: Record<WorkState, TaskStatus> = { NEW: "TODO", ASSIGNED: "TODO", REOPENED: "TODO", IN_PROGRESS: "DOING", ESCALATED: "DOING", WAITING: "STUCK", RESOLVED: "DONE", CLOSED: "DONE", CANCELLED: "DONE" };
const wrongStatus = STATES.filter((s) => statusOf(s) !== SHOWS[s]);
record("each state shows the status it should", wrongStatus.length === 0, wrongStatus.map((s) => `${s} shows ${statusOf(s)}`).join(", "));
record("Done means finished, and only finished", STATES.every((s) => (statusOf(s) === "DONE") === isFinished(s)));

/* ---- what a move needs ---- */
record("going on hold needs a reason", Boolean(transitionNeeds("WAITING").waitingReason));
record("resolving needs a resolution", Boolean(transitionNeeds("RESOLVED").resolution));
record("no other move needs anything", STATES.filter((s) => s !== "WAITING" && s !== "RESOLVED").every((s) => Object.keys(transitionNeeds(s)).length === 0));

/* ---- giving and taking away a holder ---- */
// Given to someone, a task waits at New (Assigned) until they press Start Work (owner, 2026-09-15).
record("given to someone, a new task waits for Start Work", stateAfterAssignment("NEW", true) === "ASSIGNED");
record("…and one already waiting keeps waiting", stateAfterAssignment("ASSIGNED", true) === "ASSIGNED");
record("given to someone else, work in progress stays work in progress", stateAfterAssignment("IN_PROGRESS", true) === "IN_PROGRESS");
record("taken from its holder, work in progress goes back to the queue", stateAfterAssignment("IN_PROGRESS", false) === "NEW");
record("…and so does Assigned", stateAfterAssignment("ASSIGNED", false) === "NEW");
const kept = STATES.filter((s) => s !== "NEW" && s !== "ASSIGNED" && s !== "IN_PROGRESS");
record("on hold, escalated, reopened and finished work keep their state either way", kept.every((s) => stateAfterAssignment(s, true) === s && stateAfterAssignment(s, false) === s));
record("an assignment's state change is always an allowed move", STATES.every((s) => [true, false].every((held) => {
  const to = stateAfterAssignment(s, held);
  return to === s || canTransition(s, to);
})));

/* ---- the old status sheet's paths ---- */
const bad: string[] = [];
let heldBackAtAssigned = 0;
let cases = 0;
for (const from of STATES) {
  for (const status of STATUSES) {
    for (const held of [true, false]) {
      cases++;
      const path = pathToStatus(from, status, held);
      if (statusOf(from) === status) {
        if (path.length) bad.push(`${from} to ${status}: expected no hops, got ${path.join(">")}`);
        continue;
      }
      if (!path.length) {
        bad.push(`${from} to ${status}: no hops`);
        continue;
      }
      let at = from;
      for (const hop of path) {
        if (!canTransition(at, hop)) bad.push(`${from} to ${status}${held ? " (held)" : ""}: ${at}>${hop} is not allowed`);
        at = hop;
      }
      if (statusOf(at) !== status) bad.push(`${from} to ${status}: ends on ${at}, which shows ${statusOf(at)}`);
      if (held && at === "ASSIGNED") heldBackAtAssigned++;
    }
  }
}
record(`every status-sheet path is a chain of allowed moves ending on that status (${cases} cases)`, bad.length === 0, bad.slice(0, 4).join("; "));
if (heldBackAtAssigned) note(`${heldBackAtAssigned} of those paths leave a task that has a holder at Assigned (To do on work in progress) — the one way left to a held task sitting at Assigned`);

/* ---- the IST day ---- */
const dayOf = (iso: string) => istDayKey(new Date(iso));
const EDGES: [string, string][] = [
  ["2026-09-11T18:29:59.999Z", "2026-09-11"],
  ["2026-09-11T18:30:00.000Z", "2026-09-12"],
  ["2026-09-12T00:00:00.000Z", "2026-09-12"],
  ["2026-09-30T18:29:59.999Z", "2026-09-30"],
  ["2026-09-30T18:30:00.000Z", "2026-10-01"],
  ["2026-12-31T18:29:59.999Z", "2026-12-31"],
  ["2026-12-31T18:30:00.000Z", "2027-01-01"],
  ["2027-02-28T18:30:00.000Z", "2027-03-01"],
  ["2028-02-28T18:30:00.000Z", "2028-02-29"],
  ["2028-02-29T18:30:00.000Z", "2028-03-01"],
];
const wrongDays = EDGES.filter(([iso, want]) => dayOf(iso) !== want);
record("the IST day turns at 18:30 UTC, across month, year and leap-day ends", wrongDays.length === 0, wrongDays.map(([iso, want]) => `${iso} gave ${dayOf(iso)}, wanted ${want}`).join("; "));
const oct1 = istDayRange("2026-10-01");
record("a day's range starts at IST midnight and ends a millisecond before the next", oct1.start.toISOString() === "2026-09-30T18:30:00.000Z" && oct1.end.toISOString() === "2026-10-01T18:29:59.999Z", `${oct1.start.toISOString()} to ${oct1.end.toISOString()}`);
const broken: string[] = [];
let days = 0;
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 86_400_000) {
  const key = new Date(t).toISOString().slice(0, 10);
  const next = new Date(t + 86_400_000).toISOString().slice(0, 10);
  const { start, end } = istDayRange(key);
  if (istDayKey(start) !== key || istDayKey(end) !== key || istDayKey(new Date(end.getTime() + 1)) !== next) broken.push(key);
  days++;
}
record(`every day of 2026 to 2028 round-trips through its range (${days} days)`, broken.length === 0, broken.slice(0, 3).join(", "));
note(`this process runs in ${Intl.DateTimeFormat().resolvedOptions().timeZone}; nothing above reads the local zone`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
