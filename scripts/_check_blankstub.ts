import { isBlankStub } from "../lib/tree";
import type { TaskDTO } from "../lib/types";

const base: TaskDTO = {
  id: "t1", projectId: "p1", isPrivate: false, ownerId: null, personalProjectId: null,
  groupColor: null, parentId: null, title: "", descriptionMd: "", status: "BACKLOG",
  priority: "P2", dueDate: null, dueProvisional: false, orderKey: "a0", gates: [], tags: [],
  links: [], createdAt: "", updatedAt: "", completedAt: null, deletedAt: null, pinnedAt: null,
  deliverableUrl: null, completedById: null, completedByName: null, assigneeId: null,
  assigneeName: null, color: null, hasDescription: false, noteCount: 0,
};
const child: TaskDTO = { ...base, id: "c1", parentId: "t1" };

type Case = { name: string; task: TaskDTO; tasks: TaskDTO[]; want: boolean };
const cases: Case[] = [
  { name: "untitled, no date (My Space stub)", task: base, tasks: [base], want: true },
  { name: "untitled + PROVISIONAL date (project root / board card)", task: { ...base, dueDate: "2026-09-10", dueProvisional: true }, tasks: [base], want: true },
  { name: "untitled + CONFIRMED date (user set it)", task: { ...base, dueDate: "2026-09-10", dueProvisional: false }, tasks: [base], want: false },
  { name: "untitled + non-BACKLOG column status + provisional date", task: { ...base, status: "PLANNED", dueDate: "2026-09-10", dueProvisional: true }, tasks: [base], want: true },
  { name: "untitled but has a note", task: { ...base, noteCount: 1 }, tasks: [base], want: false },
  { name: "untitled but has a description", task: { ...base, descriptionMd: "x", hasDescription: true }, tasks: [base], want: false },
  { name: "untitled but has a tag", task: { ...base, tags: ["x"] }, tasks: [base], want: false },
  { name: "untitled but pinned", task: { ...base, pinnedAt: "2026-09-01" }, tasks: [base], want: false },
  { name: "untitled but DONE (completed)", task: { ...base, status: "DONE", completedAt: "2026-09-01" }, tasks: [base], want: false },
  { name: "titled", task: { ...base, title: "Real task" }, tasks: [base], want: false },
  { name: "whitespace-only title", task: { ...base, title: "   " }, tasks: [base], want: true },
  { name: "untitled but HAS a child", task: base, tasks: [base, child], want: false },
];

// Subtask date handling: an INHERITED date (equal to the parent's) is not the subtask's
// own intent; a DIFFERENT confirmed date the user set on the subtask is.
const datedParent: TaskDTO = { ...base, id: "t1", dueDate: "2026-09-20", dueProvisional: false };
const inheritedSub: TaskDTO = { ...base, id: "s1", parentId: "t1", dueDate: "2026-09-20", dueProvisional: false };
const ownDatedSub: TaskDTO = { ...base, id: "s2", parentId: "t1", dueDate: "2026-10-05", dueProvisional: false };
cases.push(
  { name: "untitled subtask with INHERITED parent date", task: inheritedSub, tasks: [datedParent, inheritedSub], want: true },
  { name: "untitled subtask with its OWN (different) date", task: ownDatedSub, tasks: [datedParent, ownDatedSub], want: false },
);

let fails = 0;
for (const c of cases) {
  const got = isBlankStub(c.task, c.tasks);
  const ok = got === c.want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(52)} got=${got} want=${c.want}`);
}
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
