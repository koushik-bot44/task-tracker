import { PrismaClient, type Priority, type Status } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { DEFAULT_GATE_TEMPLATE, type Gate } from "../lib/gates";

const prisma = new PrismaClient();

type SeedTask = {
  title: string;
  status?: Status;
  priority?: Priority;
  /** Days from today; negative is overdue. */
  due?: number;
  /** Gate keys that have passed. */
  passed?: string[];
  tags?: string[];
  children?: SeedTask[];
};

type SeedProject = {
  name: string;
  slug: string;
  color: string;
  icon: string;
  health: "ACTIVE" | "PAUSED" | "SHIPPED" | "IDEA";
  tasks: SeedTask[];
};

const PROJECTS: SeedProject[] = [
  {
    name: "Skyzen Webhooks",
    slug: "skyzen-webhooks",
    color: "#2dd4bf",
    icon: "webhook",
    health: "ACTIVE",
    tasks: [
      {
        title: "Delivery pipeline",
        status: "IN_PROGRESS",
        priority: "P1",
        tags: ["backend"],
        children: [
          {
            title: "Ingest layer",
            status: "IN_PROGRESS",
            passed: ["built"],
            children: [
              {
                title: "Signature verification",
                status: "DONE",
                priority: "P0",
                passed: ["built", "reviewed", "tested", "deployed", "verified"],
                children: [
                  {
                    title: "Rotate signing keys quarterly",
                    status: "DONE",
                    passed: ["built", "reviewed", "tested", "deployed", "verified"],
                  },
                  {
                    title: "Add replay-window check",
                    status: "BACKLOG",
                    priority: "P1",
                    due: 3,
                  },
                  {
                    title: "Document the header contract",
                    status: "PLANNED",
                    tags: ["docs"],
                  },
                ],
              },
              {
                title: "Retry with exponential backoff",
                status: "BLOCKED",
                priority: "P0",
                due: -2,
                passed: ["built"],
                tags: ["reliability"],
              },
              {
                title: "Idempotency keys on replay",
                status: "IN_PROGRESS",
                passed: ["built", "reviewed"],
              },
            ],
          },
          {
            title: "Delivery layer",
            status: "PLANNED",
            children: [
              { title: "Dead-letter queue", status: "BACKLOG", priority: "P1" },
              { title: "Per-endpoint rate limits", status: "BACKLOG" },
              {
                title: "Delivery receipts",
                status: "DONE",
                passed: ["built", "reviewed", "tested"],
              },
            ],
          },
        ],
      },
      {
        title: "Observability",
        status: "PLANNED",
        tags: ["ops"],
        children: [
          {
            title: "Structured logs to the warehouse",
            status: "DONE",
            passed: ["built", "reviewed", "tested", "deployed"],
          },
          { title: "Alert on delivery-failure spike", status: "BACKLOG", due: 9 },
        ],
      },
      {
        title: "Drop the legacy v1 endpoint",
        status: "CANCELLED",
        tags: ["cleanup"],
      },
    ],
  },
  {
    name: "Recruiter Dashboard",
    slug: "recruiter-dashboard",
    color: "#eab308",
    icon: "line-chart",
    health: "SHIPPED",
    tasks: [
      {
        title: "Pipeline funnel view",
        status: "DONE",
        priority: "P1",
        passed: ["built", "reviewed", "tested", "deployed", "verified"],
        children: [
          {
            title: "Stage conversion rates",
            status: "DONE",
            passed: ["built", "reviewed", "tested", "deployed", "verified"],
          },
          {
            title: "Time-in-stage histogram",
            status: "DONE",
            passed: ["built", "reviewed", "tested", "deployed"],
          },
        ],
      },
      {
        title: "Weekly digest email",
        status: "IN_PROGRESS",
        due: 1,
        passed: ["built", "reviewed"],
        tags: ["email"],
        children: [
          { title: "Copy review with Sanjay", status: "PLANNED" },
          { title: "Unsubscribe handling", status: "BACKLOG", priority: "P2" },
        ],
      },
      { title: "Dark theme parity pass", status: "BACKLOG", tags: ["design"] },
    ],
  },
];

function gatesFor(passed: string[] | undefined): Gate[] {
  const done = new Set(passed ?? []);
  const at = new Date().toISOString();
  return DEFAULT_GATE_TEMPLATE.map((gate) => ({
    key: gate.key,
    label: gate.label,
    done: done.has(gate.key),
    at: done.has(gate.key) ? at : null,
  }));
}

function dueDate(offset: number | undefined): Date | null {
  if (offset === undefined) return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

async function createTasks(
  projectId: string,
  parentId: string | null,
  nodes: SeedTask[],
): Promise<void> {
  let previousKey: string | null = null;

  for (const node of nodes) {
    const orderKey: string = generateKeyBetween(previousKey, null);
    previousKey = orderKey;

    const status = node.status ?? "BACKLOG";
    const created = await prisma.task.create({
      data: {
        projectId,
        parentId,
        title: node.title,
        status,
        priority: node.priority ?? "P2",
        dueDate: dueDate(node.due),
        orderKey,
        gates: gatesFor(node.passed),
        tags: node.tags ?? [],
        links: [],
        completedAt: status === "DONE" ? new Date() : null,
      },
    });

    if (node.children?.length) {
      await createTasks(projectId, created.id, node.children);
    }
  }
}

async function main() {
  // Idempotent: wipe and rebuild the sample data so reseeding is safe.
  await prisma.project.deleteMany({
    where: { slug: { in: PROJECTS.map((p) => p.slug) } },
  });

  let projectKey: string | null = null;

  for (const seed of PROJECTS) {
    projectKey = generateKeyBetween(projectKey, null);
    const project = await prisma.project.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        color: seed.color,
        icon: seed.icon,
        health: seed.health,
        gateTemplate: DEFAULT_GATE_TEMPLATE,
        orderKey: projectKey,
      },
    });
    await createTasks(project.id, null, seed.tasks);
    console.log(`Seeded ${seed.name}`);
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
