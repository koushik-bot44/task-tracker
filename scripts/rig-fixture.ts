/* Demo accounts for the older rigs, on the local clone only (2026-09-11).
 *   npx tsx --env-file=.env.local scripts/rig-fixture.ts create
 *   npx tsx --env-file=.env.local scripts/rig-fixture.ts remove
 *
 * After the data reset the organisation holds only the CEO and the default
 * departments, so the rigs written against the old demo company — flows, e2e,
 * work-filters, check-assign-notify, check-attachments, check-wellbeing — had
 * nobody to sign in as. `create` makes exactly the accounts they use (made-up
 * names, the demo password, placed where the rigs expect), makes heads for
 * Development and HR, and gives the CEO a Well Being person with a few weeks of
 * made-up routine, plus one project in Development with a task, for the rigs that
 * look for an existing one. `remove` takes back exactly that, and puts the heads back.
 * Nothing here is anybody's real data. It refuses any database but the clone,
 * and refuses to touch an account or a Well Being person that is already there.
 * Run the organisation set-up checks (check-org-setup) without the fixture.
 */
import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hashPassword } from "../lib/password";
import { RIG_ACCOUNTS, RIG_PASSWORD, RIG_PERSON, RIG_PERSON_BEFORE_TASKS, RIG_PROJECT } from "./rig-fixture-data";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const MANIFEST = ".localdb/rig-fixture.json";
type Manifest = { createdAt: string; heads: { departmentId: string; previous: string | null }[]; projectId?: string };

const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const todayKey = IST.format(new Date());
const addDays = (k: string, n: number) => {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (k: string) => addDays(k, -((new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7));
const day = (k: string) => new Date(`${k}T00:00:00.000Z`);
const allEmails = () => [...RIG_ACCOUNTS.map((a) => a.email), RIG_PERSON.email];

const SEGMENTS: readonly (readonly [string, readonly string[]])[] = [
  ["Sleep", ["In bed by ten", "Up by seven"]],
  ["Screen time", ["No phone at dinner", "One hour of games"]],
  ["Study", ["Homework before play", "Read for twenty minutes"]],
  ["Food", ["Fruit every day", "Finish the water bottle"]],
  ["Fitness", ["Play outside", "Stretch in the morning"]],
  ["Home", ["Make the bed", "Help with the dishes"]],
];

async function create() {
  if (existsSync(MANIFEST)) throw new Error(`${MANIFEST} exists: the fixture is already made — remove it first`);
  const ceo = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true } });
  if (!ceo) throw new Error("no CEO on the clone");
  const there = await prisma.user.findMany({ where: { email: { in: allEmails() } }, select: { email: true } });
  if (there.length) throw new Error(`already on the clone, not touching them: ${there.map((u) => u.email).join(", ")}`);
  if (await prisma.person.findUnique({ where: { managerId: ceo.id } })) throw new Error("the CEO already has a Well Being person — not replacing it");
  if (await prisma.project.findFirst({ where: { OR: [{ name: RIG_PROJECT.name }, { slug: RIG_PROJECT.slug }] } })) throw new Error(`a project called ${RIG_PROJECT.name} is already there — not touching it`);
  const departments = await prisma.department.findMany({ select: { id: true, name: true, hodId: true } });
  const departmentId = (name: string) => {
    const d = departments.find((x) => x.name === name);
    if (!d) throw new Error(`no ${name} department on the clone`);
    return d.id;
  };

  const hash = await hashPassword(RIG_PASSWORD);
  const manifest: Manifest = { createdAt: new Date().toISOString(), heads: [] };
  mkdirSync(".localdb", { recursive: true });
  try {
    for (const a of RIG_ACCOUNTS) {
      const user = await prisma.user.create({
        data: { email: a.email, name: a.name, role: a.role, passwordHash: hash, status: "ACTIVE", departmentId: a.department ? departmentId(a.department) : null },
      });
      if (a.heads) {
        const d = departments.find((x) => x.name === a.heads)!;
        manifest.heads.push({ departmentId: d.id, previous: d.hodId });
        await prisma.department.update({ where: { id: d.id }, data: { hodId: user.id } });
      }
    }
    console.log(`made ${RIG_ACCOUNTS.length} accounts; heads for ${manifest.heads.length} departments`);

    // One project in Development with one task, led by the lead and held by the dev.
    const lead = await prisma.user.findUniqueOrThrow({ where: { email: "lead@orbit.local" }, select: { id: true } });
    const dev = await prisma.user.findUniqueOrThrow({ where: { email: "dev@orbit.local" }, select: { id: true } });
    const project = await prisma.project.create({
      data: { name: RIG_PROJECT.name, slug: RIG_PROJECT.slug, color: "#475569", orderKey: generateKeyBetween((await prisma.project.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } }))?.orderKey ?? null, null), departmentId: departmentId("Development"), ownerId: ceo.id, leadId: lead.id, members: { create: [{ userId: dev.id }] } },
      select: { id: true },
    });
    manifest.projectId = project.id;
    await prisma.task.create({
      data: { title: RIG_PROJECT.task, orderKey: generateKeyBetween(null, null), projectId: project.id, departmentId: departmentId("Development"), assigneeId: dev.id, requesterId: ceo.id, givenById: ceo.id, assignedAt: new Date(), state: "IN_PROGRESS", status: "DOING" },
    });
    console.log(`made ${RIG_PROJECT.name} with one task`);

    // The CEO's Well Being person and a few weeks of routine.
    const login = await prisma.user.create({ data: { email: RIG_PERSON.email, name: RIG_PERSON.name, role: "PERSON", passwordHash: hash, status: "ACTIVE" } });
    const person = await prisma.person.create({ data: { managerId: ceo.id, userId: login.id, name: RIG_PERSON.name } });
    const thisMonday = mondayOf(todayKey);
    const lastMonday = addDays(thisMonday, -7);
    for (const [s, [segmentName, habits]] of SEGMENTS.entries()) {
      const segment = await prisma.habitSegment.create({ data: { personId: person.id, name: segmentName, orderKey: `a${s}` } });
      for (const [h, habitName] of habits.entries()) {
        const habit = await prisma.habit.create({ data: { segmentId: segment.id, name: habitName, orderKey: `a${h}`, targetPerWeek: 5 } });
        // Last week: four days met of seven, so short of a perfect score.
        for (let d = 0; d < 7; d++) await prisma.habitMark.create({ data: { habitId: habit.id, date: day(addDays(lastMonday, d)), value: d < 4 ? "MET" : "MISSED" } });
        // This week, up to today.
        for (let k = thisMonday; k <= todayKey; k = addDays(k, 1)) await prisma.habitMark.create({ data: { habitId: habit.id, date: day(k), value: "MET" } });
      }
    }
    const rule = await prisma.nonNegotiable.create({ data: { personId: person.id, name: "No screens after nine", orderKey: "a0" } });
    for (let d = 0; d < 7; d++) {
      const k = addDays(thisMonday, d);
      await prisma.nonNegotiableMark.create({ data: { nonNegotiableId: rule.id, date: day(k), done: k < todayKey } });
    }
    for (let m = 3; m >= 0; m--) {
      const d = day(todayKey);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - m);
      await prisma.weightEntry.create({ data: { personId: person.id, date: d, weightKg: 32 + (3 - m) * 0.4 } });
    }
    await prisma.routineTask.create({ data: { personId: person.id, title: "Pack the school bag", dueDate: day(todayKey) } });
    await prisma.routineTask.create({ data: { personId: person.id, title: "Water the plants", dueDate: null } });
    for (const [i, title] of RIG_PERSON_BEFORE_TASKS.entries()) {
      const due = addDays(thisMonday, -7 * (2 + (i % 3)) + (i % 5));
      await prisma.routineTask.create({ data: { personId: person.id, title, dueDate: day(due), done: i % 2 === 0, doneAt: i % 2 === 0 ? day(due) : null } });
    }
    console.log(`made the CEO's Well Being person with ${SEGMENTS.length} segments, a rule, four months of weights and ${RIG_PERSON_BEFORE_TASKS.length + 2} tasks`);
  } finally {
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  }
}

async function remove() {
  const manifest: Manifest | null = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest) : null;
  // The fixture's project first: its tasks, notes, milestones and meetings go with it.
  const projects = (await prisma.project.findMany({ where: { OR: [{ id: manifest?.projectId ?? "" }, { slug: RIG_PROJECT.slug }] }, select: { id: true } })).map((p) => p.id);
  if (projects.length) {
    const taskIds = (await prisma.task.findMany({ where: { projectId: { in: projects } }, select: { id: true } })).map((t) => t.id);
    const milestoneIds = (await prisma.milestone.findMany({ where: { projectId: { in: projects } }, select: { id: true } })).map((m) => m.id);
    const eventIds = (await prisma.calendarEvent.findMany({ where: { OR: [{ projectId: { in: projects } }, { taskId: { in: taskIds } }, { milestoneId: { in: milestoneIds } }] }, select: { id: true } })).map((e) => e.id);
    await prisma.eventAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.comment.deleteMany({ where: { targetId: { in: [...projects, ...milestoneIds, ...taskIds] } } });
    await prisma.notification.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
  }
  const ids = (await prisma.user.findMany({ where: { email: { in: allEmails() } }, select: { id: true } })).map((u) => u.id);
  if (ids.length) {
    // Anything a rig left that would refuse deleting these accounts.
    const events = (await prisma.calendarEvent.findMany({ where: { createdById: { in: ids } }, select: { id: true } })).map((e) => e.id);
    await prisma.eventAttendee.deleteMany({ where: { eventId: { in: events } } });
    await prisma.calendarEvent.deleteMany({ where: { id: { in: events } } });
    await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
    await prisma.routineCollaborator.deleteMany({ where: { OR: [{ invitedById: { in: ids } }, { managerId: { in: ids } }] } });
    // The Well Being person and all of its routine go with its login.
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  for (const h of manifest?.heads ?? []) await prisma.department.updateMany({ where: { id: h.departmentId }, data: { hodId: h.previous } });
  if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
  console.log(`removed ${ids.length} fixture accounts and ${projects.length} project${manifest ? `; put back ${manifest.heads.length} heads` : " (no manifest found)"}`);
}

const action = process.argv[2];
(action === "create" ? create() : action === "remove" ? remove() : Promise.reject(new Error("usage: rig-fixture.ts create | remove")))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
