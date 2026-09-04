/**
 * Parser checks for lib/quick-add.ts. Pure function in, assertions out — no
 * browser, no database. Throws on the first failure and exits non-zero.
 *
 *   npm run test:parser
 */
import { parseQuickAdd, type QuickAddProject, type QuickAddUser } from "../lib/quick-add";

const PROJECTS: QuickAddProject[] = [
  { id: "p1", name: "Skyzen Webhooks", slug: "skyzen-webhooks" },
  { id: "p2", name: "Skyzen Billing", slug: "skyzen-billing" },
  { id: "p3", name: "Recruiter Dashboard", slug: "recruiter-dashboard" },
];

// A Wednesday, so weekday rollover is observable in both directions.
const WEDNESDAY = new Date(2026, 6, 22);

// Two Priyas on purpose: "@priya" has to stay unresolved rather than pick one.
const USERS: QuickAddUser[] = [
  { id: "u1", name: "Priya Raman" },
  { id: "u2", name: "Priya Nair" },
  { id: "u3", name: "Arun Menon" },
];

let passed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${(error as Error).message}`);
    process.exit(1);
  }
  passed++;
  console.log(`PASS  ${name}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function dayOf(iso: string | undefined): string {
  if (!iso) return "none";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

check("bare title", () => {
  const r = parseQuickAdd("Fix the retry loop", PROJECTS, WEDNESDAY);
  equal(r.title, "Fix the retry loop", "title");
  equal(r.projectId, undefined, "projectId");
  equal(r.priority, undefined, "priority");
  equal(r.tags, [], "tags");
  assert(r.spans.every((s) => s.kind === "text"), "every span should be plain text");
});

check("#tool by unique prefix", () => {
  const r = parseQuickAdd("Ship it #recruiter", PROJECTS, WEDNESDAY);
  equal(r.projectId, "p3", "projectId");
  equal(r.title, "Ship it", "title");
  assert(
    r.spans.some((s) => s.kind === "project" && s.text === "#recruiter"),
    "project span missing",
  );
});

check("#tool exact slug beats prefix ambiguity", () => {
  const r = parseQuickAdd("Task #skyzen-webhooks", PROJECTS, WEDNESDAY);
  equal(r.projectId, "p1", "projectId");
  equal(r.ambiguous, undefined, "should not be ambiguous");
});

check("ambiguous #tool is unresolved and reports candidates", () => {
  const r = parseQuickAdd("Task #skyzen", PROJECTS, WEDNESDAY);
  equal(r.projectId, undefined, "projectId");
  equal(r.ambiguous?.token, "skyzen", "ambiguous token");
  equal(r.ambiguous?.candidates.length, 2, "candidate count");
  assert(
    r.spans.some((s) => s.kind === "unresolved"),
    "unresolved span missing",
  );
});

check("unknown #tool is unresolved with no candidates", () => {
  const r = parseQuickAdd("Task #nope", PROJECTS, WEDNESDAY);
  equal(r.projectId, undefined, "projectId");
  equal(r.ambiguous?.candidates.length, 0, "candidate count");
});

check("!p0..!p3 case-insensitive", () => {
  equal(parseQuickAdd("a !p0", PROJECTS, WEDNESDAY).priority, "P0", "p0");
  equal(parseQuickAdd("a !P1", PROJECTS, WEDNESDAY).priority, "P1", "P1 uppercase");
  equal(parseQuickAdd("a !p3", PROJECTS, WEDNESDAY).priority, "P3", "p3");
  equal(parseQuickAdd("a !p4", PROJECTS, WEDNESDAY).priority, undefined, "p4 invalid");
  equal(parseQuickAdd("a !p4", PROJECTS, WEDNESDAY).title, "a !p4", "invalid stays title");
});

check("due:today and due:tomorrow", () => {
  equal(dayOf(parseQuickAdd("a due:today", PROJECTS, WEDNESDAY).dueDate), "2026-07-22", "today");
  equal(
    dayOf(parseQuickAdd("a due:tomorrow", PROJECTS, WEDNESDAY).dueDate),
    "2026-07-23",
    "tomorrow",
  );
});

check("weekday rolls forward, never lands on today", () => {
  // Wednesday 2026-07-22: fri is two days out, mon is five.
  equal(dayOf(parseQuickAdd("a due:fri", PROJECTS, WEDNESDAY).dueDate), "2026-07-24", "fri");
  equal(dayOf(parseQuickAdd("a due:mon", PROJECTS, WEDNESDAY).dueDate), "2026-07-27", "mon");
  // Asking for the current weekday means next week, not zero days away.
  equal(dayOf(parseQuickAdd("a due:wed", PROJECTS, WEDNESDAY).dueDate), "2026-07-29", "wed");
});

check("due:yyyy-mm-dd, and impossible dates rejected", () => {
  equal(
    dayOf(parseQuickAdd("a due:2026-12-25", PROJECTS, WEDNESDAY).dueDate),
    "2026-12-25",
    "explicit date",
  );
  const bad = parseQuickAdd("a due:2026-02-31", PROJECTS, WEDNESDAY);
  equal(bad.dueDate, undefined, "31 February should not roll over into March");
  assert(
    bad.spans.some((s) => s.kind === "unresolved"),
    "bad date should mark an unresolved span",
  );
});

check("+tag repeatable, deduped, charset enforced", () => {
  const r = parseQuickAdd("a +backend +infra +backend", PROJECTS, WEDNESDAY);
  equal(r.tags, ["backend", "infra"], "tags");
  const bad = parseQuickAdd("a +Not_Valid!", PROJECTS, WEDNESDAY);
  equal(bad.tags, [], "invalid tag rejected");
  equal(bad.title, "a +Not_Valid!", "invalid tag falls back to title");
});

check("all tokens combined", () => {
  const r = parseQuickAdd(
    "Fix retry #skyzen-webhooks !p1 due:fri +backend",
    PROJECTS,
    WEDNESDAY,
  );
  equal(r.title, "Fix retry", "title");
  equal(r.projectId, "p1", "projectId");
  equal(r.priority, "P1", "priority");
  equal(dayOf(r.dueDate), "2026-07-24", "dueDate");
  equal(r.tags, ["backend"], "tags");
  equal(
    r.spans.map((s) => s.kind),
    ["text", "text", "project", "priority", "due", "tag"],
    "span kinds in order",
  );
});

check("spans index back into the raw input", () => {
  const input = "Fix retry #skyzen-webhooks !p1";
  const r = parseQuickAdd(input, PROJECTS, WEDNESDAY);
  for (const span of r.spans) {
    equal(input.slice(span.start, span.end), span.text, `span at ${span.start}`);
  }
});

check("tokens anywhere, not just trailing", () => {
  const r = parseQuickAdd("!p0 #recruiter Urgent thing +ops", PROJECTS, WEDNESDAY);
  equal(r.title, "Urgent thing", "title");
  equal(r.priority, "P0", "priority");
  equal(r.projectId, "p3", "projectId");
  equal(r.tags, ["ops"], "tags");
});

check("@token resolves on a unique first-name prefix", () => {
  const r = parseQuickAdd("Ship the thing @arun", PROJECTS, WEDNESDAY, USERS);
  equal(r.title, "Ship the thing", "title");
  equal(r.assigneeId, "u3", "assigneeId");
  equal(r.ambiguousAssignee, undefined, "not ambiguous");
});

check("@token resolves on a surname, not just the leading word", () => {
  const r = parseQuickAdd("Fix it @raman", PROJECTS, WEDNESDAY, USERS);
  equal(r.assigneeId, "u1", "assigneeId");
});

check("@token shared by two people stays unresolved", () => {
  const r = parseQuickAdd("Fix it @priya", PROJECTS, WEDNESDAY, USERS);
  equal(r.assigneeId, undefined, "no assignee guessed");
  equal(r.ambiguousAssignee?.token, "priya", "token reported");
  equal(r.ambiguousAssignee?.candidates.length, 2, "both candidates offered");
  equal(r.spans.map((s) => s.kind).includes("unresolved"), true, "marked unresolved");
});

check("@token naming nobody stays unresolved", () => {
  const r = parseQuickAdd("Fix it @nobody", PROJECTS, WEDNESDAY, USERS);
  equal(r.assigneeId, undefined, "no assignee");
  equal(r.ambiguousAssignee?.candidates.length, 0, "no candidates");
});

check("full name with a hyphen for the space resolves exactly", () => {
  const r = parseQuickAdd("Fix it @priya-nair", PROJECTS, WEDNESDAY, USERS);
  equal(r.assigneeId, "u2", "exact full-name match wins");
});

check("@ combines with every other token", () => {
  const input = "Retry logic #skyzen-webhooks !p1 due:fri +backend @arun";
  const r = parseQuickAdd(input, PROJECTS, WEDNESDAY, USERS);
  equal(r.title, "Retry logic", "title");
  equal(r.projectId, "p1", "projectId");
  equal(r.priority, "P1", "priority");
  equal(dayOf(r.dueDate), "2026-07-24", "dueDate");
  equal(r.tags, ["backend"], "tags");
  equal(r.assigneeId, "u3", "assigneeId");
  equal(
    r.spans.map((s) => s.kind),
    ["text", "text", "project", "priority", "due", "tag", "assignee"],
    "span kinds in order",
  );
});

check("@ spans index back into the raw input", () => {
  const input = "Fix retry @arun !p1";
  const r = parseQuickAdd(input, PROJECTS, WEDNESDAY, USERS);
  for (const span of r.spans) {
    equal(input.slice(span.start, span.end), span.text, `span at ${span.start}`);
  }
});

check("a bare @ is ordinary text", () => {
  const r = parseQuickAdd("email @ work", PROJECTS, WEDNESDAY, USERS);
  equal(r.title, "email @ work", "title keeps the @");
  equal(r.assigneeId, undefined, "no assignee");
});

console.log(`\n${passed} parser checks passed`);
