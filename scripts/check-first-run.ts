/* A new organisation's first visit (2026-09-11).
 *   npx tsx --env-file=.env.local scripts/check-first-run.ts
 *
 * On a throwaway database beside the clone — orbit_firstrun, made, migrated
 * with scripts/db-deploy.sh and dropped here; the clone is never touched — the
 * set-up route is called directly:
 *   - the login page asks for set-up while there are no accounts;
 *   - a wrong passcode is refused;
 *   - two first visits at the same moment make ONE CEO, and the other is refused;
 *   - that CEO is signed in, and the default departments exist, made by them;
 *   - a later set-up is refused, and the login page stops asking.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const CLONE = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(CLONE) || !/\/orbit_clone(\?|$)/.test(CLONE)) {
  console.error("DATABASE_URL is not the local clone. Refusing.");
  process.exit(1);
}
const NAME = "orbit_firstrun";
const FRESH = CLONE.replace(/\/orbit_clone(\?.*)?$/, `/${NAME}$1`);
const MAINT = CLONE.replace(/\/orbit_clone(\?.*)?$/, "/postgres$1");
const PASSCODE = "first-run-rig-passcode";

let pass = 0;
let fail = 0;
function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const maint = new PrismaClient({ datasourceUrl: MAINT });

async function main() {
  await maint.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);
  await maint.$executeRawUnsafe(`CREATE DATABASE ${NAME}`);
  execFileSync("sh", ["scripts/db-deploy.sh", NAME], { stdio: "pipe" });
  record("a throwaway database is made and migrated", true, NAME);

  // Everything below talks to the throwaway database only.
  process.env.DATABASE_URL = FRESH;
  process.env.DATABASE_URL_UNPOOLED = FRESH;
  process.env.APP_PASSCODE = PASSCODE;
  const bootstrap = await import("../app/api/auth/bootstrap/route");
  const { DEFAULT_DEPARTMENTS } = await import("../lib/default-departments");
  const { prisma } = await import("../lib/prisma");
  try {
    const post = (body: Record<string, string>, ip: string) =>
      bootstrap.POST(new Request("http://localhost/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

    const before = await (await bootstrap.GET()).json();
    record("with no accounts, the login page asks for set-up", before.needsBootstrap === true, JSON.stringify(before));

    const wrong = await post({ passcode: "not-it", name: "Rig CEO", email: "ceo@example.com", password: "First-Run-Rig-1" }, "10.9.0.1");
    record("a wrong passcode is refused", wrong.status === 401, `status ${wrong.status}`);
    record("…and makes nobody", (await prisma.user.count()) === 0);

    const both = await Promise.all([
      post({ passcode: PASSCODE, name: "Rig CEO", email: "ceo@example.com", password: "First-Run-Rig-1" }, "10.9.0.2"),
      post({ passcode: PASSCODE, name: "Rig Other", email: "other@example.com", password: "First-Run-Rig-2" }, "10.9.0.3"),
    ]);
    const statuses = both.map((r) => r.status).sort();
    record("two first visits at once: one is set up, the other refused", statuses[0] === 200 && statuses[1] === 410, statuses.join(", "));
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, status: true } });
    record("…exactly one account exists, and it is the CEO", users.length === 1 && users[0].role === "FOUNDER", JSON.stringify(users.map((u) => u.role)));
    const won = both.find((r) => r.status === 200);
    record("…who is signed in straight away", Boolean(won?.headers.get("set-cookie")?.includes("orbit_session=")));

    const departments = await prisma.department.findMany({ orderBy: { orderKey: "asc" }, select: { name: true, hodId: true, createdById: true, description: true } });
    record(
      "the default departments are there, in order",
      departments.map((d) => d.name).join("|") === DEFAULT_DEPARTMENTS.map((d) => d.name).join("|"),
      departments.map((d) => d.name).join(", "),
    );
    record("…made by the CEO, with no heads yet and a description each", departments.every((d) => d.createdById === users[0]?.id && d.hodId === null && d.description.length > 0));

    const again = await post({ passcode: PASSCODE, name: "Rig Late", email: "late@example.com", password: "First-Run-Rig-3" }, "10.9.0.4");
    record("a later set-up is refused", again.status === 410, `status ${again.status}`);
    const after = await (await bootstrap.GET()).json();
    record("…and the login page stops asking", after.needsBootstrap === false);
    record("…and still one account, nine departments", (await prisma.user.count()) === 1 && (await prisma.department.count()) === DEFAULT_DEPARTMENTS.length);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await maint.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`).catch((e) => console.error("drop:", e));
    await maint.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
