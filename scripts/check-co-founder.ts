/* The co-founder (2026-09-09).
 *   npx tsx --env-file=.env.local scripts/check-co-founder.ts   (dev server up)
 *
 * Everything the CEO sees, the co-founder sees. Two things stay the CEO's
 * alone: Well Being, which is personal and not a company feature, and the CEO
 * account itself. Throwaway accounts (cf-*) are removed in `finally`.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.SCREEN_BASE ?? "http://localhost:3000";
const PREFIX = "cf-";
const PASSWORD = "Rig-Cofounder-77";
let pass = 0;
let fail = 0;

function record(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}

const signIn = async (email: string, password: string) => {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
};

async function main() {
  const hash = await hashPassword(PASSWORD);
  const co = await prisma.user.upsert({
    where: { email: `${PREFIX}co@orbit.local` },
    update: { passwordHash: hash, role: "CO_FOUNDER", status: "ACTIVE", disabledAt: null, departmentId: null },
    create: { email: `${PREFIX}co@orbit.local`, name: "CF Cofounder", role: "CO_FOUNDER", passwordHash: hash, status: "ACTIVE" },
  });
  const ceoRow = await prisma.user.findFirst({ where: { role: "FOUNDER" }, select: { id: true, email: true } });
  if (!ceoRow) throw new Error("no CEO on the clone");
  const coCookie = await signIn(co.email, PASSWORD);
  const ceoCookie = await signIn(ceoRow.email, "orbit123");
  record("the co-founder can sign in", coCookie.startsWith("orbit_session="), "");
  record("the CEO can sign in", ceoCookie.startsWith("orbit_session="), "");

  /* ---- oversight, not entry ----
     He sees the SHAPE of the company — every department and how much work is
     in each — but opens only the projects he has been put on. */
  const departments = await call(coCookie, "GET", "/api/departments");
  const all = await prisma.department.count();
  record("the co-founder sees every department", (departments.json ?? []).length === all, `${(departments.json ?? []).length} of ${all}`);

  const dev = (departments.json ?? []).find((d: any) => d.name === "Development");
  const realCount = await prisma.project.count({ where: { departmentId: dev?.id } });
  record("…with the real number of projects in each", dev?.projectCount === realCount, `shows ${dev?.projectCount}, really ${realCount}`);

  const onProjects = await prisma.projectMember.count({ where: { userId: co.id } });
  const coProjects = await call(coCookie, "GET", "/api/projects");
  const ceoProjects = await call(ceoCookie, "GET", "/api/projects");
  record("…but opens only the projects he is on", (coProjects.json ?? []).length === onProjects, `${(coProjects.json ?? []).length} open, ${onProjects} memberships`);
  record("…which is fewer than the CEO's", (coProjects.json ?? []).length < (ceoProjects.json ?? []).length, `${(coProjects.json ?? []).length} vs ${(ceoProjects.json ?? []).length}`);

  const notHis = await prisma.project.findFirst({
    where: { members: { none: { userId: co.id } }, leadId: { not: co.id }, ownerId: { not: co.id } },
    select: { id: true, slug: true, name: true },
  });
  if (notHis) {
    const peek = await call(coCookie, "GET", `/api/projects/${notHis.id}/members`);
    record("a project he is not on stays closed", peek.status === 404 || peek.status === 403, `${notHis.name} -> ${peek.status}`);
  } else {
    record("a project he is not on stays closed", true, "he is on all of them");
  }

  const coWork = await call(coCookie, "GET", "/api/work?limit=200");
  const ceoWork = await call(ceoCookie, "GET", "/api/work?limit=200");
  record("he sees less work than the CEO", (coWork.json?.total ?? 0) < (ceoWork.json?.total ?? 0), `co ${coWork.json?.total} vs ceo ${ceoWork.json?.total}`);
  record("…and all of it is on projects he is on", (coWork.json?.items ?? []).every((t: any) => !t.projectId || (coProjects.json ?? []).some((p: any) => p.id === t.projectId)), "");

  /* ---- Well Being is Rahul's alone ---- */
  const wellBeing = await call(coCookie, "GET", "/api/routine");
  record("Well Being is closed to the co-founder", wellBeing.status === 403, `status ${wellBeing.status}`);
  const makePerson = await call(coCookie, "POST", "/api/routine", { name: "CF Person", email: `${PREFIX}person@orbit.local`, password: "personpass123" });
  record("…and they cannot start one either", makePerson.status === 403, `status ${makePerson.status}`);
  const me = await call(coCookie, "GET", "/api/users/me");
  record("the Well Being tab is not offered to them", me.json?.hasFamily === false, String(me.json?.hasFamily));
  const ceoMe = await call(ceoCookie, "GET", "/api/users/me");
  record("…while the CEO still has it", ceoMe.json?.hasFamily === true, String(ceoMe.json?.hasFamily));

  /* ---- the CEO account is Rahul's alone ---- */
  const touchCeo = await call(coCookie, "PATCH", `/api/users/${ceoRow.id}`, { role: "MANAGER" });
  record("the co-founder cannot re-role the CEO", touchCeo.status === 403, `status ${touchCeo.status}`);
  const ceoPassword = await call(coCookie, "POST", `/api/users/${ceoRow.id}/password`, { password: "Another-One-99" });
  record("nor set the CEO's password", ceoPassword.status === 403, `status ${ceoPassword.status}`);

  /* ---- appointing one is the CEO's call ---- */
  const coMakesCo = await call(coCookie, "POST", "/api/users", { name: "CF Second", email: `${PREFIX}second@orbit.local`, role: "CO_FOUNDER" });
  record("a co-founder cannot appoint another co-founder", coMakesCo.status === 403, `status ${coMakesCo.status} ${JSON.stringify(coMakesCo.json?.error ?? "")}`);
  const ceoMakesCo = await call(ceoCookie, "POST", "/api/users", { name: "CF Made", email: `${PREFIX}made@orbit.local`, role: "CO_FOUNDER" });
  record("the CEO can appoint one", ceoMakesCo.status === 201, `status ${ceoMakesCo.status} ${JSON.stringify(ceoMakesCo.json?.error ?? "")}`);
  const anyoneFounder = await call(ceoCookie, "POST", "/api/users", { name: "CF Boss", email: `${PREFIX}boss@orbit.local`, role: "FOUNDER" });
  record("nobody can mint a second CEO", anyoneFounder.status === 403, `status ${anyoneFounder.status}`);

  /* ---- ordinary work still works ---- */
  const dept = await prisma.department.findFirst({ orderBy: { orderKey: "asc" } });
  const raised = await call(coCookie, "POST", "/api/tasks", { title: "CF Task", type: "GENERAL", priority: "MEDIUM", departmentId: dept!.id });
  record("the co-founder can raise work", raised.status === 201, `status ${raised.status}`);
  const madeProject = await call(coCookie, "POST", "/api/projects", { name: "CF Project", departmentId: dept!.id });
  record("…and start a project in any department", madeProject.status === 201, `status ${madeProject.status}`);
  const hod = await call(coCookie, "POST", "/api/users", { name: "CF Head", email: `${PREFIX}head@orbit.local`, role: "HOD", departmentId: dept!.id });
  record("…and appoint people below them", hod.status === 201, `status ${hod.status}`);
  const invited = await call(coCookie, "POST", "/api/users", { name: "CF Invitee", email: `${PREFIX}invitee@orbit.local`, emails: [`${PREFIX}invitee-alt@orbit.local`], role: "RESOURCE", departmentId: dept!.id });
  record("…and invite somebody with several addresses", invited.status === 201, `status ${invited.status}`);
}

main()
  .catch((e) => { console.error(e); fail++; })
  .finally(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: "CF " } } });
    await prisma.project.deleteMany({ where: { name: { startsWith: "CF " } } });
    const mine = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
    const ids = mine.map((u) => u.id);
    if (ids.length) {
      await prisma.department.updateMany({ where: { hodId: { in: ids } }, data: { hodId: null } });
      await prisma.invite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
