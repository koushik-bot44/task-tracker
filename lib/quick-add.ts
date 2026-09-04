import type { Priority } from "./types";

export type SpanKind =
  | "text"
  | "project"
  | "priority"
  | "due"
  | "tag"
  | "assignee"
  | "unresolved";

export type Span = {
  kind: SpanKind;
  /** Index into the raw input, so the overlay can line chips up exactly. */
  start: number;
  end: number;
  text: string;
};

export type QuickAddProject = { id: string; name: string; slug: string };
export type QuickAddUser = { id: string; name: string };

export type QuickAddResult = {
  title: string;
  projectId?: string;
  priority?: Priority;
  dueDate?: string;
  assigneeId?: string;
  tags: string[];
  spans: Span[];
  /** Set when a #token matched nothing, or matched more than one tool. */
  ambiguous?: { token: string; candidates: QuickAddProject[] };
  /** The same, for an @token that named nobody or too many people. */
  ambiguousAssignee?: { token: string; candidates: QuickAddUser[] };
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIso(date: Date): string {
  return startOfDay(date).toISOString();
}

/**
 * Weekday tokens always mean the *next* occurrence, strictly after today —
 * "due:mon" typed on a Monday means the Monday coming, not the one you are
 * standing in.
 */
function nextWeekday(target: number, today: Date): Date {
  const result = startOfDay(today);
  const delta = (target - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + (delta === 0 ? 7 : delta));
  return result;
}

function parseDue(value: string, today: Date): string | null {
  const lower = value.toLowerCase();

  if (lower === "today") return toIso(today);
  if (lower === "tomorrow") {
    const d = startOfDay(today);
    d.setDate(d.getDate() + 1);
    return toIso(d);
  }

  const weekday = WEEKDAYS.indexOf(lower as (typeof WEEKDAYS)[number]);
  if (weekday !== -1) return toIso(nextWeekday(weekday, today));

  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const [y, m, d] = lower.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    // Reject impossible dates like 2026-02-31, which Date would roll over.
    if (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    ) {
      return toIso(date);
    }
  }

  return null;
}

/**
 * Resolves a #token against the tool list by unique prefix, on slug or name.
 * An exact slug match always wins outright, so a tool whose slug is a prefix
 * of another's stays reachable.
 */
function resolveProject(
  token: string,
  projects: QuickAddProject[],
): { project?: QuickAddProject; candidates: QuickAddProject[] } {
  const needle = token.toLowerCase();

  const exact = projects.find((p) => p.slug.toLowerCase() === needle);
  if (exact) return { project: exact, candidates: [exact] };

  const matches = projects.filter(
    (p) =>
      p.slug.toLowerCase().startsWith(needle) ||
      p.name.toLowerCase().replace(/\s+/g, "-").startsWith(needle),
  );

  if (matches.length === 1) return { project: matches[0], candidates: matches };
  return { candidates: matches };
}

/**
 * Resolves an @token against active users by unique prefix, on the full name
 * or on any single word of it — "@raman" should find Priya Raman, because
 * that is how people refer to each other. Same rule as #tool: exactly one
 * match resolves, nought or several leave it unresolved rather than guessing.
 */
function resolveUser(
  token: string,
  users: QuickAddUser[],
): { user?: QuickAddUser; candidates: QuickAddUser[] } {
  const needle = token.toLowerCase().replace(/\s+/g, "-");

  const exact = users.filter(
    (u) => u.name.toLowerCase().replace(/\s+/g, "-") === needle,
  );
  if (exact.length === 1) return { user: exact[0], candidates: exact };

  const matches = users.filter((u) => {
    const full = u.name.toLowerCase().replace(/\s+/g, "-");
    if (full.startsWith(needle)) return true;
    return u.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(needle));
  });

  if (matches.length === 1) return { user: matches[0], candidates: matches };
  return { candidates: matches };
}

/**
 * Pure, so it can be unit-tested without a browser or a database.
 * `today` is injectable for the same reason.
 */
export function parseQuickAdd(
  input: string,
  projects: QuickAddProject[],
  today: Date = new Date(),
  users: QuickAddUser[] = [],
): QuickAddResult {
  const spans: Span[] = [];
  const tags: string[] = [];
  const titleParts: string[] = [];

  let projectId: string | undefined;
  let priority: Priority | undefined;
  let dueDate: string | undefined;
  let assigneeId: string | undefined;
  let ambiguous: QuickAddResult["ambiguous"];
  let ambiguousAssignee: QuickAddResult["ambiguousAssignee"];

  // Walk whitespace-delimited chunks, remembering where each one started so
  // the input overlay can colourise in place.
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;
    const push = (kind: SpanKind) => spans.push({ kind, start, end, text: word });

    if (word.startsWith("#") && word.length > 1) {
      const token = word.slice(1);
      const { project, candidates } = resolveProject(token, projects);
      if (project) {
        projectId = project.id;
        push("project");
      } else {
        ambiguous = { token, candidates };
        push("unresolved");
      }
      continue;
    }

    if (word.startsWith("@") && word.length > 1) {
      const token = word.slice(1);
      const { user, candidates } = resolveUser(token, users);
      if (user) {
        assigneeId = user.id;
        push("assignee");
      } else {
        ambiguousAssignee = { token, candidates };
        push("unresolved");
      }
      continue;
    }

    if (/^!p[0-3]$/i.test(word)) {
      priority = word.slice(1).toUpperCase() as Priority;
      push("priority");
      continue;
    }

    if (/^due:/i.test(word)) {
      const parsed = parseDue(word.slice(4), today);
      if (parsed) {
        dueDate = parsed;
        push("due");
      } else {
        push("unresolved");
      }
      continue;
    }

    if (word.startsWith("+") && word.length > 1) {
      const tag = word.slice(1).toLowerCase();
      if (/^[a-z0-9-]+$/.test(tag)) {
        if (!tags.includes(tag)) tags.push(tag);
        push("tag");
        continue;
      }
    }

    titleParts.push(word);
    push("text");
  }

  return {
    title: titleParts.join(" "),
    projectId,
    priority,
    dueDate,
    assigneeId,
    tags,
    spans,
    ambiguous,
    ambiguousAssignee,
  };
}
