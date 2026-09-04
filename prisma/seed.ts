/**
 * Fresh-database seed for LOCAL DEV ONLY (restructure model, 2026-09).
 *
 *   npm run db:seed                                   (prisma db seed)
 *   npx tsx --env-file=.env.local prisma/seed.ts
 *
 * Two departments; two projects — one with two milestones whose reviews are
 * still ahead, one with none; a dozen tasks spread across To do / Doing /
 * Stuck / Done, a few steps, and one project note. Idempotent-ish: it does
 * NOTHING when any project already exists, so it can never land on top of
 * real data. Never run against production.
 */
import { PrismaClient, type Role, type TaskStatus } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

type SeedStep = { title: string; status?: TaskStatus };

type SeedTask = {
  title: string;
  status?: TaskStatus;
  /** Days from today; negative is overdue. Omit = the milestone's review date (or no date). */
  due?: number;
  important?: boolean;
  archived?: boolean;
  /** Index into the project's milestones; omit = "Not in a milestone yet". */
  milestone?: number;
  steps?: SeedStep[];
};

/** `review` is days from today — always ahead, so the box still "needs an OK". */
type SeedMilestone = { name: string; review: number };

type SeedProject = {
  name: string;
  slug: string;
  color: string;
  icon: string;
  department: string;
  status: "PLANNED" | "ACTIVE" | "PAUSED" | "DONE";
  description: string;
  /** Days from today. */
  start: number;
  deadline: number;
  /** 0-100, the founder's hand-set number. */
  progress: number;
  milestones: SeedMilestone[];
  tasks: SeedTask[];
};

const DEPARTMENTS = [
  { name: "Engineering", color: "#0d9488", description: "Builds and runs the product." },
  { name: "Operations", color: "#0369a1", description: "Keeps the company's day-to-day work running." },
];

const PROJECTS: SeedProject[] = [
  {
    name: "Skyzen Webhooks",
    slug: "skyzen-webhooks",
    color: "#2dd4bf",
    icon: "webhook",
    department: "Engineering",
    status: "ACTIVE",
    description: "Reliable outbound webhooks for Skyzen customers.",
    start: -20,
    deadline: 45,
    progress: 35,
    milestones: [
      { name: "Ingest layer", review: 10 },
      { name: "Delivery layer", review: 24 },
    ],
    tasks: [
      { title: "Signature verification", status: "DONE", milestone: 0, due: -5 },
      { title: "Retry with exponential backoff", status: "STUCK", milestone: 0, due: -2, important: true },
      {
        title: "Idempotency keys on replay",
        status: "DOING",
        milestone: 0,
        due: 3,
        steps: [
          { title: "Write the replay test", status: "DONE" },
          { title: "Wire the dedupe cache" },
        ],
      },
      { title: "Document the header contract", milestone: 0 },
      { title: "Dead-letter queue", milestone: 1, due: 20 },
      {
        title: "Per-endpoint rate limits",
        status: "DOING",
        milestone: 1,
        due: 18,
        steps: [{ title: "Pick the bucket size" }, { title: "Add the 429 body" }],
      },
      { title: "Delivery receipts", status: "DONE", milestone: 1, due: -1 },
      { title: "Alert on delivery-failure spike", due: 9 },
      { title: "Drop the legacy v1 endpoint", status: "DONE", archived: true },
    ],
  },
  {
    name: "Recruiter Dashboard",
    slug: "recruiter-dashboard",
    color: "#eab308",
    icon: "line-chart",
    department: "Operations",
    status: "PLANNED",
    description: "One screen for the hiring pipeline.",
    start: 0,
    deadline: 60,
    progress: 0,
    milestones: [],
    tasks: [
      { title: "Pipeline funnel view", status: "DOING", due: 7, important: true },
      { title: "Weekly digest email", due: 14 },
      { title: "Dark theme parity pass", status: "STUCK", due: 5 },
    ],
  },
];

/** Local noon, `offset` days from today — how the app stores a chosen due date. */
function dayAt(offset: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

/** UTC midnight, `offset` days from today — how review/meeting days are stored. */
function utcDay(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

const AUTHORITY: Role[] = ["FOUNDER", "DIRECTOR", "HOD", "MANAGER"];

/** Someone to own the projects, give the tasks and write the note. */
async function seedAuthor(): Promise<{ id: string; name: string }> {
  const found = await prisma.user.findFirst({
    where: { role: { in: AUTHORITY }, disabledAt: null, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (found) return found;
  const email = "seed-manager@orbit.local";
  const password = "orbit123";
  const created = await prisma.user.create({
    data: { email, name: "Seed Manager", role: "MANAGER", passwordHash: await hashPassword(password), status: "ACTIVE" },
    select: { id: true, name: true },
  });
  console.log(`created ${email} / ${password} (MANAGER) to own the seed`);
  return created;
}

async function ensureDepartments(createdById: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const last = await prisma.department.findFirst({ orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  let key: string | null = last?.orderKey ?? null;
  for (const d of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name: { equals: d.name, mode: "insensitive" } }, select: { id: true } });
    if (existing) {
      out.set(d.name, existing.id);
      continue;
    }
    key = generateKeyBetween(key, null);
    const created = await prisma.department.create({
      data: { name: d.name, color: d.color, description: d.description, orderKey: key, createdById },
      select: { id: true },
    });
    out.set(d.name, created.id);
    console.log(`department ${d.name}`);
  }
  return out;
}

async function main() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`skip: ${existing} project(s) already exist — the seed only fills an empty database`);
    return;
  }

  const author = await seedAuthor();
  const team = await prisma.user.findMany({
    where: { role: { in: ["TEAM_LEAD", "RESOURCE"] }, disabledAt: null, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  const lead = team.find((u) => u.role === "TEAM_LEAD") ?? null;
  // Task holders, round-robin: the author plus whoever is on the team.
  const people = [author.id, ...team.map((u) => u.id)];
  const departments = await ensureDepartments(author.id);

  let projectKey: string | null = null;
  let holderIndex = 0;

  for (const seed of PROJECTS) {
    projectKey = generateKeyBetween(projectKey, null);
    const project = await prisma.project.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        color: seed.color,
        icon: seed.icon,
        status: seed.status,
        description: seed.description,
        orderKey: projectKey,
        startDate: utcDay(seed.start),
        deadline: utcDay(seed.deadline),
        progress: seed.progress,
        departmentId: departments.get(seed.department) ?? null,
        ownerId: author.id,
        leadId: lead?.id ?? null,
      },
    });

    // Milestone boxes, in order.
    const milestoneIds: string[] = [];
    let milestoneKey: string | null = null;
    for (const m of seed.milestones) {
      milestoneKey = generateKeyBetween(milestoneKey, null);
      const created = await prisma.milestone.create({
        data: { projectId: project.id, name: m.name, reviewDate: utcDay(m.review), orderKey: milestoneKey },
      });
      milestoneIds.push(created.id);
    }

    // Tasks and their steps. A step follows its task's milestone, date and person.
    const holdersByMilestone = new Map<string, Set<string>>();
    let taskKey: string | null = null;
    for (const t of seed.tasks) {
      taskKey = generateKeyBetween(taskKey, null);
      const status = t.status ?? "TODO";
      const milestoneId = t.milestone === undefined ? null : milestoneIds[t.milestone];
      const guessed = t.due === undefined && t.milestone !== undefined;
      const dueDate = t.due !== undefined ? dayAt(t.due) : guessed ? utcDay(seed.milestones[t.milestone as number].review) : null;
      const assigneeId = people[holderIndex++ % people.length];
      const done = status === "DONE" ? { completedAt: new Date(), completedById: assigneeId } : {};

      const root = await prisma.task.create({
        data: {
          projectId: project.id,
          milestoneId,
          title: t.title,
          status,
          dueDate,
          dueProvisional: guessed,
          orderKey: taskKey,
          important: t.important ?? false,
          archived: t.archived ?? false,
          assigneeId,
          givenById: author.id,
          ...done,
        },
      });
      if (milestoneId && !t.archived) {
        const set = holdersByMilestone.get(milestoneId) ?? new Set<string>();
        set.add(assigneeId);
        holdersByMilestone.set(milestoneId, set);
      }

      let stepKey: string | null = null;
      for (const s of t.steps ?? []) {
        stepKey = generateKeyBetween(stepKey, null);
        const stepStatus = s.status ?? "TODO";
        await prisma.task.create({
          data: {
            projectId: project.id,
            parentId: root.id,
            milestoneId,
            title: s.title,
            status: stepStatus,
            dueDate,
            dueProvisional: guessed,
            orderKey: stepKey,
            givenById: author.id,
            ...(stepStatus === "DONE" ? { completedAt: new Date(), completedById: assigneeId } : {}),
          },
        });
      }
    }

    // Each milestone's review IS a meeting: 11:00, the author (owner), the lead
    // and everyone holding a task in the box.
    for (let i = 0; i < seed.milestones.length; i++) {
      const id = milestoneIds[i];
      const attendees = new Set<string>([author.id, ...(lead ? [lead.id] : []), ...(holdersByMilestone.get(id) ?? [])]);
      const event = await prisma.calendarEvent.create({
        data: {
          title: `${seed.milestones[i].name} review`,
          description: `Review of ${seed.milestones[i].name} · ${seed.name}`,
          date: utcDay(seed.milestones[i].review),
          startTime: "11:00",
          isMeeting: true,
          projectId: project.id,
          milestoneId: id,
          createdById: author.id,
          attendees: { create: [...attendees].map((userId) => ({ userId })) },
        },
        select: { id: true },
      });
      await prisma.milestone.update({ where: { id }, data: { reviewEventId: event.id } });
    }

    console.log(`project ${seed.name} (${seed.tasks.length} tasks, ${seed.milestones.length} milestones)`);
  }

  // One project note, on the first project.
  const first = await prisma.project.findUnique({ where: { slug: PROJECTS[0].slug }, select: { id: true } });
  if (first) {
    await prisma.comment.create({
      data: {
        targetType: "PROJECT",
        targetId: first.id,
        authorId: author.id,
        body: "Kick-off done. Ingest layer first; the delivery layer starts after its review.",
      },
    });
    console.log("project note added");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
